import React, { useState, useEffect, useMemo } from 'react';

function App() {
  // State variables for managing the list of budget items and months
  const [items, setItems] = useState([]);
  const [months, setMonths] = useState([]);
  const [selectedMonthId, setSelectedMonthId] = useState(''); // Stores the ID of the currently selected month
  const [allowedOwners, setAllowedOwners] = useState([]); // State for allowed owners

  // State variables for the new budget item form
  const [newItemName, setNewItemName] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  const [newItemOwner, setNewItemOwner] = useState('1'); // Default owner ID to 1
  const [newItemRepeating, setNewItemRepeating] = useState(false);
  const [newItemStartDate, setNewItemStartDate] = useState('');
  const [newItemEndDate, setNewItemEndDate] = useState('');
  const [newItemMonth, setNewItemMonth] = useState(''); // For assigning item to a month in the form
  const [newCategory, setNewCategory] = useState('expense'); // New state for category, default to expense

  // State variables for creating a new month
  const [newMonthYear, setNewMonthYear] = useState(new Date().getFullYear());
  const [newMonthNumber, setNewMonthNumber] = useState(new Date().getMonth() + 1); // JS months are 0-indexed

  // State for tracking which item is currently being edited
  const [editingItemId, setEditingItemId] = useState(null);
  // State to hold values for the item being edited
  const [editedItem, setEditedItem] = useState({
    name: '',
    value: '',
    owner: '',
    repeating: false,
    start_date: '',
    end_date: '',
    month: '',
    category: '' // New field
  });

  // --- Effect to fetch months and set default selected month on initial load ---
  useEffect(() => {
    const initializeApp = async () => {
      console.log("initializeApp: Fetching months and allowed owners...");
      const [fetchedMonths, fetchedOwners] = await Promise.all([
        fetchMonths(), // Fetch all available months
        fetchAllowedOwners() // Fetch allowed owners
      ]);
      
      if (fetchedMonths.length > 0) {
        // Find the current month (year and month_number)
        const currentYear = new Date().getFullYear();
        const currentMonthNumber = new Date().getMonth() + 1; // getMonth() is 0-indexed

        let defaultMonth = fetchedMonths.find(
          month => month.year === currentYear && month.month_number === currentMonthNumber
        );

        // If current month doesn't exist, try to create it
        if (!defaultMonth) {
          console.log("initializeApp: Current month not found, attempting to create it.");
          const createdMonth = await createCurrentMonth(currentYear, currentMonthNumber);
          if (createdMonth) {
            defaultMonth = createdMonth;
            setMonths(prevMonths => [...prevMonths, createdMonth]); // Add new month to state
          }
        }

        if (defaultMonth) {
          setSelectedMonthId(defaultMonth.id); // Set the default selected month
          console.log("initializeApp: Default selected month set to ID:", defaultMonth.id);
        } else {
          console.warn("initializeApp: No default month could be set or created.");
        }
      }
    };

    initializeApp();
  }, []); // Runs once on component mount

  // --- Effect to fetch budget items whenever the selectedMonthId changes ---
  useEffect(() => {
    if (selectedMonthId) { // Only fetch if a month is selected
      console.log("useEffect: selectedMonthId changed, fetching items for month ID:", selectedMonthId);
      fetchItems(selectedMonthId);
      setNewItemMonth(selectedMonthId); // Also pre-select month in Add Item form
    }
  }, [selectedMonthId]); // Reruns whenever selectedMonthId changes

  /**
   * Calculates the total value of all items currently in the 'items' state.
   * useMemo is used to re-calculate only when 'items' array changes.
   */
  const totalItemsValue = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.value || 0), 0);
  }, [items]);

  /**
   * Gets the username for a given owner ID.
   * @param {number} ownerId - The ID of the owner
   * @returns {string} The username or 'Unknown' if not found
   */
  const getOwnerUsername = (ownerId) => {
    const owner = allowedOwners.find(o => o.id === ownerId);
    return owner ? owner.username : 'Unknown';
  };

  /**
   * Fetches all available budget months from the Django backend.
   * @returns {Array} An array of month objects.
   */
  const fetchMonths = async () => {
    console.log("fetchMonths: Attempting to fetch from http://localhost:8000/api/months");
    try {
      const response = await fetch('http://localhost:8000/api/months');
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`fetchMonths: HTTP error! status: ${response.status}, text: ${errorText}`);
        return [];
      }
      const data = await response.json();
      console.log("fetchMonths: Parsed JSON data:", data);
      setMonths(data);
      return data; // Return data for immediate use in initializeApp
    } catch (error) {
      console.error("fetchMonths: Error fetching months:", error);
      return [];
    }
  };

  /**
   * Fetches allowed owners from the Django backend.
   * @returns {Array} An array of allowed owner objects.
   */
  const fetchAllowedOwners = async () => {
    console.log("fetchAllowedOwners: Attempting to fetch from http://localhost:8000/api/allowed-owners");
    try {
      const response = await fetch('http://localhost:8000/api/allowed-owners');
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`fetchAllowedOwners: HTTP error! status: ${response.status}, text: ${errorText}`);
        return [];
      }
      const data = await response.json();
      console.log("fetchAllowedOwners: Parsed JSON data:", data);
      setAllowedOwners(data);
      // Set default owner to the first allowed owner if available
      if (data.length > 0) {
        setNewItemOwner(data[0].id.toString());
      }
      return data;
    } catch (error) {
      console.error("fetchAllowedOwners: Error fetching allowed owners:", error);
      return [];
    }
  };

  /**
   * Creates the current month if it doesn't already exist.
   */
  const createCurrentMonth = async (year, monthNumber) => {
    console.log(`createCurrentMonth: Attempting to create month ${monthNumber}/${year}`);
    try {
      const payload = {
        year: year,
        month_number: monthNumber,
        // owner field removed as per models.py update
        // owner: parseInt(newItemOwner) // No longer needed for Month model
      };
      const response = await fetch('http://localhost:8000/api/months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`createCurrentMonth: Error creating month: ${response.status}, Details: ${JSON.stringify(errorData)}`);
        return null;
      }
      const newMonth = await response.json();
      console.log("createCurrentMonth: Successfully created month:", newMonth);
      return newMonth;
    } catch (error) {
      console.error("createCurrentMonth: Error creating month:", error);
      return null;
    }
  };


  /**
   * Fetches budget items for a specific month ID.
   * @param {number} monthId - The ID of the month to filter items by.
   */
  const fetchItems = async (monthId) => {
    console.log(`fetchItems: Attempting to fetch from http://localhost:8000/api/items?month_id=${monthId}`);
    try {
      // Append month_id as a query parameter for filtering
      const response = await fetch(`http://localhost:8000/api/items?month_id=${monthId}`);
      console.log("fetchItems: Response received, status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`fetchItems: HTTP error! status: ${response.status}, text: ${errorText}`);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("fetchItems: Parsed JSON data for selected month:", data);
      setItems(data);
      console.log("fetchItems: Items state updated to:", data);

    } catch (error) {
      console.error("fetchItems: Error fetching items:", error);
    }
  };

  /**
   * Handles the submission of the new budget item form.
   * Sends a POST request to the Django backend to create a new item.
   */
  const handleAddItem = async () => {
    // Basic client-side validation
    if (!newItemName.trim() || !newItemValue.trim() || !newItemOwner.trim() || !newItemMonth || !newCategory) {
      alert("Service, Value, Owner, Month, and Category are required fields.");
      return;
    }

    const payload = {
      name: newItemName.trim(), // 'name' corresponds to 'Service'
      value: parseFloat(newItemValue),
      owner: parseInt(newItemOwner),
      repeating: newItemRepeating,
      start_date: newItemStartDate || null,
      end_date: newItemEndDate || null,
      month: parseInt(newItemMonth),
      category: newCategory, // New field
    };

    console.log("React: Sending payload to /api/items (POST):", payload);

    try {
      const response = await fetch('http://localhost:8000/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log("React: POST response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("React: Error response from backend:", errorData);
        throw new Error(`HTTP error! Status: ${response.status}, Details: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("React: Created item data from backend:", data);

      if (data.month === parseInt(selectedMonthId)) {
        setItems(prevItems => [...prevItems, data]);
      } else {
        fetchItems(selectedMonthId);
      }

      // Clear the form fields after successful submission
      setNewItemName('');
      setNewItemValue('');
      setNewItemOwner('1');
      setNewItemRepeating(false);
      setNewItemStartDate('');
      setNewItemEndDate('');
      // newItemMonth remains pre-selected for convenience
      setNewCategory('expense'); // Reset category default

      fetchMonths(); // Re-fetch months in case a new one was just created for default
    } catch (error) {
      console.error("React: Error adding item in catch block:", error);
      alert(`Failed to add item: ${error.message}`);
    }
  };

  /**
   * Handles creating a new month from the dedicated form.
   */
  const handleCreateMonth = async () => {
    if (!newMonthYear || !newMonthNumber) { // Removed owner from validation
      alert("Year and Month Number are required to create a new month.");
      return;
    }
    const payload = {
      year: parseInt(newMonthYear),
      month_number: parseInt(newMonthNumber),
      // owner removed from payload
    };
    console.log("React: Sending payload to /api/months (POST):", payload);

    try {
      const response = await fetch('http://localhost:8000/api/months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("React: Error response from backend (create month):", errorData);
        throw new Error(`HTTP error! Status: ${response.status}, Details: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("React: Created month data from backend:", data);
      setMonths(prevMonths => [...prevMonths, data]);
      setSelectedMonthId(data.id);
      setNewMonthYear(new Date().getFullYear());
      setNewMonthNumber(new Date().getMonth() + 1);

    } catch (error) {
      console.error("React: Error creating month in catch block:", error);
      alert(`Failed to create month: ${error.message}`);
    }
  };

  /**
   * Enters edit mode for a specific budget item.
   * @param {Object} itemToEdit - The item object to begin editing.
   */
  const handleEditClick = (itemToEdit) => {
    setEditingItemId(itemToEdit.id);
    setEditedItem({
      name: itemToEdit.name,
      value: itemToEdit.value,
      owner: itemToEdit.owner,
      repeating: itemToEdit.repeating,
      start_date: itemToEdit.start_date || '', // Convert null to empty string for date inputs
      end_date: itemToEdit.end_date || '',
      month: itemToEdit.month,
      category: itemToEdit.category || 'expense' // Default if not set
    });
  };

  /**
   * Cancels edit mode for the current item.
   */
  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditedItem({
      name: '', value: '', owner: '', repeating: false, start_date: '', end_date: '', month: '', category: 'expense'
    });
  };

  /**
   * Saves the edited budget item by sending a PUT request to the backend.
   * @param {number} itemId - The ID of the item to save.
   */
  const handleSaveEdit = async (itemId) => {
    // Client-side validation for edited item
    if (!editedItem.name.trim() || !editedItem.value || !editedItem.owner || !editedItem.category) {
      alert("Service, Value, Owner, and Category are required fields for editing.");
      return;
    }

    const payload = {
      name: editedItem.name.trim(),
      value: parseFloat(editedItem.value),
      owner: parseInt(editedItem.owner),
      repeating: editedItem.repeating,
      start_date: editedItem.start_date || null,
      end_date: editedItem.end_date || null,
      month: editedItem.month ? parseInt(editedItem.month) : null,
      category: editedItem.category,
    };
    console.log(`React: Sending payload to /api/items/${itemId} (PUT):`, payload);

    try {
      const response = await fetch(`http://localhost:8000/api/items/${itemId}`, {
        method: 'PUT', // Use PUT for updates
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("React: Error response from backend (save edit):", errorData);
        throw new Error(`HTTP error! Status: ${response.status}, Details: ${JSON.stringify(errorData)}`);
      }

      const updatedItem = await response.json();
      console.log("React: Updated item data from backend:", updatedItem);

      // Update the items list in state
      setItems(prevItems =>
        prevItems.map(item => (item.id === itemId ? updatedItem : item))
      );

      handleCancelEdit(); // Exit edit mode
      fetchMonths(); // Re-fetch months in case category changes impact totals or filtering logic
    } catch (error) {
      console.error("React: Error saving item:", error);
      alert(`Failed to save item: ${error.message}`);
    }
  };


  // Get the display name for the currently selected month
  const currentMonthDisplayName = months.find(m => m.id === parseInt(selectedMonthId))?.month_display || 'Loading...';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 sm:p-8 font-inter antialiased flex items-center justify-center">
      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden my-8">
        <header className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-6 sm:p-8 text-center shadow-lg rounded-t-2xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            🚀 Budget Tracker
          </h1>
          <p className="text-purple-100 text-lg sm:text-xl font-light">Manage your finances month by month</p>
        </header>

        <main className="p-6 sm:p-8 space-y-8">
          {/* Month Selection */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-800 mb-4 flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l3 3a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd"></path></svg>
              Select Your Budget Month
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <select
                value={selectedMonthId}
                onChange={(e) => setSelectedMonthId(e.target.value)}
                className="flex-grow p-3 border border-blue-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-200 ease-in-out text-base bg-white appearance-none pr-8 cursor-pointer hover:border-blue-400 text-gray-800"
                style={{backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%234299e1'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.5rem auto'}}
              >
                <option value="">-- Choose a Month --</option>
                {months.map(month => (
                  <option key={month.id} value={month.id}>
                    {month.month_display} {month.year}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Create New Month Form */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-yellow-100 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-yellow-800 mb-4 flex items-center">
              <svg className="w-4 h-4 mr-2 text-yellow-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586A3 3 0 0010 3a3 3 0 00-2.414.914A2 2 0 004 5zm2 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
              Create New Budget Month
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col">
                <label htmlFor="newMonthYear" className="text-sm font-medium text-gray-700 mb-1">Year</label>
                <input
                  type="number"
                  value={newMonthYear}
                  onChange={(e) => setNewMonthYear(e.target.value)}
                  placeholder="e.g., 2025"
                  id="newMonthYear"
                  name="newMonthYear"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-yellow-500 focus:border-yellow-500 transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="newMonthNumber" className="text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={newMonthNumber}
                  onChange={(e) => setNewMonthNumber(e.target.value)}
                  id="newMonthNumber"
                  name="newMonthNumber"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-yellow-500 focus:border-yellow-500 transition duration-150 ease-in-out text-gray-800"
                >
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleCreateMonth}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-75 button-gradient"
                >
                  Create Month
                </button>
              </div>
            </div>
          </section>

          {/* Add New Budget Item Form */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-purple-100 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-purple-800 mb-6 border-b pb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"></path></svg>
              Add New Item for {currentMonthDisplayName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col">
                <label htmlFor="newItemName" className="text-sm font-medium text-gray-700 mb-1">Service</label> {/* Changed 'Item Name' to 'Service' */}
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g., Monthly Rent"
                  id="newItemName"
                  name="newItemName"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="newItemValue" className="text-sm font-medium text-gray-700 mb-1">Value (£)</label>
                <input
                  type="number"
                  value={newItemValue}
                  onChange={(e) => setNewItemValue(e.target.value)}
                  placeholder="e.g., 500.00"
                  id="newItemValue"
                  name="newItemValue"
                  step="0.01"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="newItemOwner" className="text-sm font-medium text-gray-700 mb-1">Owner</label>
                <select
                  value={newItemOwner}
                  onChange={(e) => setNewItemOwner(e.target.value)}
                  id="newItemOwner"
                  name="newItemOwner"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out text-gray-800"
                >
                  {allowedOwners.map(owner => (
                    <option key={owner.id} value={owner.id}>
                      {owner.username}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center mt-6">
                <input
                  type="checkbox"
                  checked={newItemRepeating}
                  onChange={(e) => setNewItemRepeating(e.target.checked)}
                  id="newItemRepeating"
                  name="newItemRepeating"
                  className="h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="newItemRepeating" className="ml-2 block text-sm font-medium text-gray-700">
                  Repeating Item
                </label>
              </div>
              <div className="flex flex-col">
                <label htmlFor="newCategory" className="text-sm font-medium text-gray-700 mb-1">Category</label> {/* New Category Field */}
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  id="newCategory"
                  name="newCategory"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out text-gray-800"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label htmlFor="newItemStartDate" className="text-sm font-medium text-gray-700 mb-1">Start Date (Optional)</label>
                <input
                  type="date"
                  value={newItemStartDate}
                  onChange={(e) => setNewItemStartDate(e.target.value)}
                  id="newItemStartDate"
                  name="newItemStartDate"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="newItemEndDate" className="text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                <input
                  type="date"
                  value={newItemEndDate}
                  onChange={(e) => setNewItemEndDate(e.target.value)}
                  id="newItemEndDate"
                  name="newItemEndDate"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="newItemMonth" className="text-sm font-medium text-gray-700 mb-1">Assign to Month</label>
                <select
                  value={newItemMonth}
                  onChange={(e) => setNewItemMonth(e.target.value)}
                  id="newItemMonth"
                  name="newItemMonth"
                  className="p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out text-gray-800"
                >
                  <option value="">-- Select a Month --</option>
                  {months.map(month => (
                    <option key={month.id} value={month.id}>
                      {month.month_display} {month.year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleAddItem}
              className="mt-8 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 button-gradient"
            >
              Add Budget Item
            </button>
          </section>

          {/* List of Budget Items */}
          <section className="bg-white p-6 rounded-xl shadow-lg border border-green-100 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-6 border-b pb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm11.5 1.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM12.5 10a.5.5 0 00-1 0v4.293l-1.146-1.147a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l2-2a.5.5 0 00-.708-.708L12.5 14.293V10z" clipRule="evenodd"></path></svg>
              Items for {currentMonthDisplayName}
            </h2>

            {/* Display Total Value */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-teal-50 rounded-lg shadow-md text-center border border-green-200">
              <p className="text-lg font-semibold text-green-800">
                Total for {currentMonthDisplayName}:{' '}
                <span className="text-2xl font-extrabold text-green-900">
                  £{totalItemsValue.toFixed(2)}
                </span>
              </p>
            </div>

            {items.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-lg">No budget items for this month. Start by adding one above!</p>
            ) : (
              <ul className="space-y-4">
                {items.map(item => (
                  <li key={item.id} className="bg-gray-50 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-200 transform transition duration-200 hover:scale-[1.02] hover:shadow-md">
                    {editingItemId === item.id ? (
                      // Edit mode for the item
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col">
                          <label htmlFor={`editName-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Service</label>
                          <input
                            type="text"
                            id={`editName-${item.id}`}
                            value={editedItem.name}
                            onChange={(e) => setEditedItem({ ...editedItem, name: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editValue-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Value (£)</label>
                          <input
                            type="number"
                            id={`editValue-${item.id}`}
                            value={editedItem.value}
                            onChange={(e) => setEditedItem({ ...editedItem, value: e.target.value })}
                            step="0.01"
                            className="p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editOwner-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Owner</label>
                          <select
                            id={`editOwner-${item.id}`}
                            value={editedItem.owner}
                            onChange={(e) => setEditedItem({ ...editedItem, owner: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md text-gray-800"
                          >
                            {allowedOwners.map(owner => (
                              <option key={owner.id} value={owner.id}>
                                {owner.username}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`editRepeating-${item.id}`}
                            checked={editedItem.repeating}
                            onChange={(e) => setEditedItem({ ...editedItem, repeating: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                          <label htmlFor={`editRepeating-${item.id}`} className="ml-2 text-sm text-gray-700">Repeating</label>
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editCategory-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Category</label>
                          <select
                            id={`editCategory-${item.id}`}
                            value={editedItem.category}
                            onChange={(e) => setEditedItem({ ...editedItem, category: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md text-gray-800"
                          >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editStartDate-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input
                            type="date"
                            id={`editStartDate-${item.id}`}
                            value={editedItem.start_date}
                            onChange={(e) => setEditedItem({ ...editedItem, start_date: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editEndDate-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <input
                            type="date"
                            id={`editEndDate-${item.id}`}
                            value={editedItem.end_date}
                            onChange={(e) => setEditedItem({ ...editedItem, end_date: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label htmlFor={`editMonth-${item.id}`} className="text-sm font-medium text-gray-700 mb-1">Month</label>
                          <select
                            id={`editMonth-${item.id}`}
                            value={editedItem.month}
                            onChange={(e) => setEditedItem({ ...editedItem, month: e.target.value })}
                            className="p-2 border border-gray-300 rounded-md text-gray-800"
                          >
                            <option value="">-- Select a Month --</option>
                            {months.map(month => (
                              <option key={month.id} value={month.id}>
                                {month.month_display} {month.year}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 mt-4 col-span-full">
                          <button
                            onClick={() => handleSaveEdit(item.id)}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow transition duration-150 ease-in-out"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg shadow transition duration-150 ease-in-out"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Display mode for the item
                      <div className="flex-1 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div className="flex-1">
                          <p className="text-lg font-semibold text-gray-800">
                            {item.name}
                            <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${item.category === 'income' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                              {item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'N/A'} {/* Display Category */}
                            </span>
                          </p>
                          <p className="text-gray-600 text-sm mt-1">
                            Value: <span className={`font-bold ${item.category === 'income' ? 'text-green-700' : 'text-red-700'}`}>£{item.value ? item.value.toFixed(2) : '0.00'}</span> {/* Category-based color */}
                            {' '}| Owner: <span className="font-semibold">{getOwnerUsername(item.owner)}</span>
                            {item.repeating && <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-800 text-xs font-medium rounded-full">Repeating</span>}
                          </p>
                          {(item.start_date || item.end_date) && (
                            <p className="text-gray-500 text-xs mt-1">
                              {item.start_date && `From: ${item.start_date}`}{item.end_date && ` To: ${item.end_date}`}
                            </p>
                          )}
                          {item.month_display && (
                            <p className="text-gray-500 text-xs mt-1">
                              Month: {item.month_display} {item.year}
                            </p>
                          )}
                        </div>
                        <div className="mt-2 sm:mt-0 sm:ml-4">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold py-2 px-3 rounded-lg shadow transition duration-150 ease-in-out"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="bg-gray-100 p-4 sm:p-6 text-center text-gray-600 text-sm border-t border-gray-200 rounded-b-2xl">
          <p>&copy; {new Date().getFullYear()} Budget Tracker. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

