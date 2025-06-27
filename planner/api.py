# myapp/api.py

from ninja import NinjaAPI
from typing import List, Optional
from pydantic import BaseModel
from .models import BudgetItem, Month # Import both Django models
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
import decimal
from datetime import date
import calendar

# Define allowed owners
ALLOWED_OWNERS = ['keith', 'tild', 'shared']

api = NinjaAPI()


def validate_owner(owner_id: int) -> User:
    """
    Validates that the owner ID corresponds to one of the allowed users.
    Returns the User object if valid, raises HttpError if not.
    """
    try:
        owner_user = get_object_or_404(User, id=owner_id)
        if owner_user.username not in ALLOWED_OWNERS:
            from ninja.errors import HttpError
            raise HttpError(400, f"Owner must be one of: {', '.join(ALLOWED_OWNERS)}. Got: {owner_user.username}")
        return owner_user
    except User.DoesNotExist:
        from ninja.errors import HttpError
        raise HttpError(404, f"User with ID {owner_id} not found.")


@api.get("/allowed-owners")
def get_allowed_owners(request):
    """
    Returns the list of allowed owners with their IDs for frontend use.
    """
    users = User.objects.filter(username__in=ALLOWED_OWNERS).order_by('username')
    return [{"id": user.id, "username": user.username} for user in users]

# --- Pydantic Schemas for Month (no changes) ---
class MonthIn(BaseModel):
    year: Optional[int] = date.today().year
    month_number: Optional[int] = date.today().month

class MonthOut(BaseModel):
    id: int
    year: int
    month_number: int
    month_display: str

    class Config:
        orm_mode = True

    @classmethod
    def from_orm(cls, obj: Month):
        return cls(
            id=obj.id,
            year=obj.year,
            month_number=obj.month_number,
            month_display=obj.get_month_display()
        )


# --- Pydantic Schemas for BudgetItem (UPDATED: category added) ---
class BudgetItemIn(BaseModel):
    name: str
    value: float
    owner: int
    repeating: bool = False
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    month: Optional[int] = None
    category: str # NEW: category field for input

class BudgetItemOut(BaseModel):
    id: int
    name: str
    value: float
    owner: int
    repeating: bool
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    month: Optional[int] = None
    month_display: Optional[str] = None
    category: str # NEW: category field for output

    class Config:
        orm_mode = True

    @classmethod
    def from_orm(cls, obj: BudgetItem):
        return cls(
            id=obj.id,
            name=obj.name,
            value=float(obj.value),
            owner=obj.owner.id,
            repeating=obj.repeating,
            start_date=str(obj.start_date) if obj.start_date else None,
            end_date=str(obj.end_date) if obj.end_date else None,
            month=obj.month.id if obj.month else None,
            month_display=obj.month.get_month_display() if obj.month else None,
            category=obj.category # NEW: category field mapping
        )


# --- API Endpoints for Month (no changes to functionality, only logging/prints adjusted) ---
@api.get("/months", response=List[MonthOut])
def list_months(request):
    """
    Retrieves a list of all budget months.
    """
    months = Month.objects.all()
    return [MonthOut.from_orm(month) for month in months]

@api.post("/months", response=MonthOut)
def create_month(request, month_in: MonthIn):
    """
    Creates a new budget month and copies repeating items from the previous month.
    """
    print(f"Django: POST request received for Month. Month_in data: {month_in.dict()}")

    try:
        # Check for existing month with same year and month_number (owner is no longer relevant for uniqueness)
        existing_month = Month.objects.filter(
            year=month_in.year,
            month_number=month_in.month_number,
        ).first()

        if existing_month:
            print(f"Django: Month {month_in.month_number}/{month_in.year} already exists. Returning existing.")
            return MonthOut.from_orm(existing_month)

        # Create the new month object
        month_obj = Month.objects.create(
            year=month_in.year,
            month_number=month_in.month_number,
        )
        print(f"Django: Successfully created Month: ID={month_obj.id}, Name='{month_obj}'")

        # --- Logic to copy repeating items from the previous month ---
        new_month_date = date(month_obj.year, month_obj.month_number, 1)

        # Calculate the previous month's year and number
        prev_month_number = month_obj.month_number - 1
        prev_month_year = month_obj.year
        if prev_month_number == 0:
            prev_month_number = 12
            prev_month_year -= 1

        print(f"Django: Looking for repeating items from previous month: {prev_month_number}/{prev_month_year}...")

        # Find the previous month object
        previous_month_obj = Month.objects.filter(
            year=prev_month_year,
            month_number=prev_month_number,
        ).first()

        if previous_month_obj:
            repeating_items = BudgetItem.objects.filter(
                month=previous_month_obj,
                repeating=True,
            ).exclude(
                end_date__lt=new_month_date
            )

            copied_count = 0
            for item_to_copy in repeating_items:
                BudgetItem.objects.create(
                    name=item_to_copy.name,
                    value=item_to_copy.value,
                    owner=item_to_copy.owner, # Keep existing owner of the item
                    repeating=item_to_copy.repeating,
                    start_date=item_to_copy.start_date,
                    end_date=item_to_copy.end_date,
                    month=month_obj, # Link to the new month object
                    category=item_to_copy.category # NEW: Copy category
                )
                copied_count += 1
            print(f"Django: Copied {copied_count} repeating items from {previous_month_obj} to {month_obj}.")
        else:
            print(f"Django: No previous month ({prev_month_number}/{prev_month_year}) found or no repeating items in it to copy.")

        return MonthOut.from_orm(month_obj)

    except Exception as e:
        print(f"Django: An unexpected error occurred during month creation: {e}")
        import traceback
        traceback.print_exc()
        from ninja.errors import HttpError
        raise HttpError(500, "An internal server error occurred during month creation.")


# --- API Endpoints for BudgetItem (UPDATED for category and PUT endpoint) ---
@api.get("/items", response=List[BudgetItemOut])
def list_budget_items(request, month_id: Optional[int] = None):
    """
    Retrieves a list of budget items, optionally filtered by month.
    """
    items = BudgetItem.objects.all()

    if month_id is not None:
        print(f"Django: Filtering budget items by month_id={month_id}")
        items = items.filter(month__id=month_id)

    return [BudgetItemOut.from_orm(item) for item in items]


@api.post("/items", response=BudgetItemOut)
def create_budget_item(request, item_in: BudgetItemIn):
    """
    Creates a new budget item.
    Expects data in the request body conforming to BudgetItemIn schema.
    """
    print(f"Django: POST request received for BudgetItem. Item_in data: {item_in.dict()}")

    try:
        # Validate owner is one of the allowed users
        owner_user = validate_owner(item_in.owner)
        print(f"Django: Found owner: {owner_user.username} (ID: {owner_user.id})")

        month_obj = None
        if item_in.month:
            month_obj = get_object_or_404(Month, id=item_in.month)
            print(f"Django: Found month: {month_obj}")

        decimal_value = decimal.Decimal(str(item_in.value))

        budget_item = BudgetItem.objects.create(
            name=item_in.name,
            value=decimal_value,
            owner=owner_user,
            repeating=item_in.repeating,
            start_date=item_in.start_date,
            end_date=item_in.end_date,
            month=month_obj,
            category=item_in.category # NEW: category field for creation
        )
        print(f"Django: Successfully created BudgetItem: ID={budget_item.id}, Name='{budget_item.name}'")

        return BudgetItemOut.from_orm(budget_item)

    except Month.DoesNotExist:
        from ninja.errors import HttpError
        print(f"Django: Month with ID {item_in.month} not found. Raising 404.")
        raise HttpError(404, f"Month with ID {item_in.month} not found.")

    except decimal.InvalidOperation:
        from ninja.errors import HttpError
        print(f"Django: Invalid value format for '{item_in.value}'. Raising 400.")
        raise HttpError(400, "Invalid value format. Please provide a valid number.")

    except Exception as e:
        from ninja.errors import HttpError
        # Don't catch HttpError - let it propagate
        if isinstance(e, HttpError):
            raise e
        print(f"Django: An unexpected error occurred during item creation: {e}")
        import traceback
        traceback.print_exc()
        raise HttpError(500, "An internal server error occurred.")


@api.put("/items/{item_id}", response=BudgetItemOut) # NEW ENDPOINT for updating items
def update_budget_item(request, item_id: int, item_in: BudgetItemIn):
    """
    Updates an existing budget item by its ID.
    Expects data in the request body conforming to BudgetItemIn schema.
    """
    print(f"Django: PUT request received for item ID {item_id}. Item_in data: {item_in.dict()}")

    try:
        budget_item = get_object_or_404(BudgetItem, id=item_id)
        print(f"Django: Found item to update: {budget_item.name} (ID: {budget_item.id})")

        # Validate owner is one of the allowed users
        owner_user = validate_owner(item_in.owner)
        month_obj = get_object_or_404(Month, id=item_in.month) if item_in.month else None

        # Update fields from the incoming payload
        budget_item.name = item_in.name
        budget_item.value = decimal.Decimal(str(item_in.value))
        budget_item.owner = owner_user
        budget_item.repeating = item_in.repeating
        budget_item.start_date = item_in.start_date
        budget_item.end_date = item_in.end_date
        budget_item.month = month_obj
        budget_item.category = item_in.category # NEW: category field update

        budget_item.save() # Save changes to the database

        print(f"Django: Successfully updated BudgetItem: ID={budget_item.id}, Name='{budget_item.name}'")
        return BudgetItemOut.from_orm(budget_item) # Return the updated item

    except BudgetItem.DoesNotExist:
        from ninja.errors import HttpError
        print(f"Django: BudgetItem with ID {item_id} not found. Raising 404.")
        raise HttpError(404, f"BudgetItem with ID {item_id} not found.")
    except Month.DoesNotExist:
        from ninja.errors import HttpError
        print(f"Django: Month with ID {item_in.month} not found for update. Raising 404.")
        raise HttpError(404, f"Month with ID {item_in.month} not found.")
    except decimal.InvalidOperation:
        from ninja.errors import HttpError
        print(f"Django: Invalid value format for '{item_in.value}' during update. Raising 400.")
        raise HttpError(400, "Invalid value format. Please provide a valid number.")
    except Exception as e:
        from ninja.errors import HttpError
        # Don't catch HttpError - let it propagate
        if isinstance(e, HttpError):
            raise e
        print(f"Django: An unexpected error occurred during item update: {e}")
        import traceback
        traceback.print_exc()
        raise HttpError(500, "An internal server error occurred during item update.")


