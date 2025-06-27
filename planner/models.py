# myapp/models.py

from django.db import models
from django.contrib.auth.models import User
from datetime import date # Import date for default values and comparison

class Month(models.Model):
    # We use year and month_number to uniquely identify a month
    year = models.IntegerField(
        help_text="The year for this budget month (e.g., 2025)",
        default=date.today().year # Default to current year
    )
    month_number = models.IntegerField(
        help_text="The month number (1 for January, 12 for December)",
        default=date.today().month # Default to current month
    )

    def __str__(self):
        # A nice string representation for the admin and debugging
        return f"{self.get_month_display()} {self.year}"

    def get_month_display(self):
        # Helper to get the month name
        import calendar
        return calendar.month_name[self.month_number]

    class Meta:
        # Ensure that each year-month combination is unique
        # If owner is not unique, you might need to adjust or handle non-unique months per year
        unique_together = ('year', 'month_number')
        ordering = ['year', 'month_number']
        verbose_name = "Budget Month"
        verbose_name_plural = "Budget Months"


class BudgetItem(models.Model):
    CATEGORY_CHOICES = [
        ('expense', 'Expense'),
        ('income', 'Income'),
    ]
    category = models.CharField(
        max_length=10,
        choices=CATEGORY_CHOICES,
        default='expense',
        help_text="Category of the budget item (Income or Expense)."
    )
    name = models.CharField(max_length=255, help_text="A descriptive name for the budget item.")
    value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="The monetary value of the budget item (e.g., 50.00)."
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='budget_items',
        help_text="The user who owns this budget item."
    )
    repeating = models.BooleanField(
        default=False,
        help_text="Indicates if this budget item is a recurring expense/income."
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Optional: The start date for the budget item, especially for repeating items."
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Optional: The end date for the budget item, especially for repeating items."
    )
    # NEW FIELD: Link to the Month model
    month = models.ForeignKey(
        Month,
        on_delete=models.SET_NULL, # If a month is deleted, budget items lose their month association
        related_name='budget_items', # Access items from a month: month.budget_items.all()
        null=True, # Allow budget items to exist without being tied to a specific month
        blank=True,
        help_text="Optional: The month this budget item belongs to."
    )


    def __str__(self):
        return f"{self.name} - £{self.value} (Owner: {self.owner.username})"

    class Meta:
        verbose_name = "Budget Item"
        verbose_name_plural = "Budget Items"
        ordering = ['name', 'start_date']
