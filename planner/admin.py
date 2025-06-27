# myapp/admin.py

from django.contrib import admin
from .models import BudgetItem, Month # Import your new Month model

# Register BudgetItem with customizations
class BudgetItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'value', 'owner', 'month', 'repeating', 'start_date', 'end_date') # Added 'month'
    list_filter = ('repeating', 'owner', 'month', 'start_date', 'end_date') # Added 'month'
    search_fields = ('name', 'owner__username')
    date_hierarchy = 'start_date'

admin.site.register(BudgetItem, BudgetItemAdmin)

# Register Month with customizations
class MonthAdmin(admin.ModelAdmin):
    list_display = ('year', 'month_number', 'get_month_display')
    list_filter = ('year', 'month_number')
    search_fields = ('year', 'month_number')
    ordering = ['-year', '-month_number'] # Order descending by year, then month

admin.site.register(Month, MonthAdmin)
