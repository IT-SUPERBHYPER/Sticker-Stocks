  // --- USER/ADMIN CONTROL ---
  let userRole = null;
  document.getElementById("loginForm").onsubmit = function(e) {
    e.preventDefault();
    const pass = document.getElementById("loginPassword").value;
    if(pass === "Superb@123") setRole("admin");
    else if(pass === "1234") setRole("user");
    else {
      document.getElementById("loginError").style.display = "block";
      setTimeout(() => document.getElementById("loginError").style.display = "none", 2500);
      document.getElementById("loginPassword").value = "";
      document.getElementById("loginPassword").focus();
    }
  };
  function setRole(role) {
    userRole = role;
    document.getElementById("loginModal").style.display = "none";
    applyRolePermissions();
  }
  function applyRolePermissions() {
    if (userRole === null) return;
    const isAdmin = userRole === "admin";
    document.querySelectorAll(".admin-only").forEach(el => { if (el) el.style.display = isAdmin ? "" : "none"; });
    document.querySelectorAll(".admin-price").forEach(el => { if (el) el.style.display = isAdmin ? "" : "none"; });
    ["stickerName","stickerLabel","initialStock","stickerCost"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isAdmin;
    });
    const ths = document.querySelectorAll("#reportTable th");
    if (ths.length > 8 && ths[8]) ths[8].style.display = isAdmin ? "" : "none";
    document.querySelectorAll("#reportTable tbody tr").forEach(row => {
      if (row.children.length > 8 && row.children[8]) row.children[8].style.display = isAdmin ? "" : "none";
      if (row.children.length > 4) {
        if(row.children[4]) row.children[4].style.display = isAdmin ? "" : "none";
        if(row.children[5]) row.children[5].style.display = isAdmin ? "" : "none";
      }
    });
  }
  // --- DARK MODE ---
  function setDark(dark) {
    if(dark) {
        document.documentElement.classList.add('dark');
        document.getElementById('darkToggleBtn').innerHTML = '<i class="fas fa-sun"></i>';
        document.getElementById('darkToggleBtn').title = "Switch to Light Mode";
        document.getElementById('darkToggleBtn').setAttribute('aria-label', 'Switch to Light Mode');
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('darkToggleBtn').innerHTML = '<i class="fas fa-moon"></i>';
        document.getElementById('darkToggleBtn').title = "Switch to Dark Mode";
        document.getElementById('darkToggleBtn').setAttribute('aria-label', 'Switch to Dark Mode');
    }
    localStorage.setItem("sticker-inv-ultra-dark", dark ? "1" : "0");
  }
  document.getElementById('darkToggleBtn').onclick = function() {
    setDark(!document.documentElement.classList.contains('dark'));
  };
  (function(){
    const saved = localStorage.getItem("sticker-inv-ultra-dark");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(saved === "1" || (!saved && prefersDark));
  })();
  // ====== FIREBASE DATA LAYER ======
  let inventory = [];
  let editIndex = -1, addStockIndex = -1, usageModalIndex = -1;
  function showLoader(show=true) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
  }
  async function loadInventory() {
    showLoader(true);
    try {
      const docRef = window.firestore.doc(window.firestore.db, "inventory", "main");
      const docSnap = await window.firestore.getDoc(docRef);
      inventory = docSnap.exists() ? docSnap.data().items || [] : [];
      
      // === DATA MIGRATION for older inventories ===
      inventory.forEach(item => {
        if (!item.transactions || !Array.isArray(item.transactions)) {
          item.transactions = [];
          // Reconstruct from initial stock + usage
          let balance = item.totalStock;
          // First, log initial add
          if (item.totalStock > 0) {
            item.transactions.push({
              type: "add",
              amount: item.totalStock,
              balance: item.totalStock,
              date: "2000-01-01",
              time: "00:00",
              person: "System",
              invoice: "MIGRATED"
            });
          }
          // Then replay usage as deductions (in order)
          if (Array.isArray(item.usage)) {
            item.usage.forEach(u => {
              balance -= u.amount;
              item.transactions.push({
                type: "deduct",
                amount: u.amount,
                balance: balance,
                date: u.date,
                time: u.time || "00:00",
                person: u.person,
                department: u.department
              });
            });
          }
          // Fix remainingStock if mismatched
          if (balance !== item.remainingStock) {
            console.warn("Balance mismatch fixed for:", item.name);
            item.remainingStock = balance;
          }
        }
      });
      
    } catch (err) {
      console.error("Load from Firebase failed:", err);
      inventory = [];
      alert('Could not load inventory data. Starting fresh.');
    } finally {
      showLoader(false);
    }
  }
  async function saveInventory() {
    showLoader(true);
    try {
      const docRef = window.firestore.doc(window.firestore.db, "inventory", "main");
      await window.firestore.setDoc(docRef, { items: inventory });
    } catch (err) {
      console.error("Save to Firebase failed:", err);
      alert('Could not save inventory data.');
    } finally {
      showLoader(false);
    }
  }
  // --- INVENTORY FUNCTIONS ---
  function addSticker() {
    const name = document.getElementById("stickerName").value.trim();
    const label = document.getElementById("stickerLabel").value;
    const stock = parseInt(document.getElementById("initialStock").value);
    const cost = parseFloat(document.getElementById("stickerCost").value) || 0;
    if (!name || !label || isNaN(stock) || stock < 0) {
      alert("Please enter valid sticker name, label and stock."); return;
    }
    if (inventory.some(s => s.name && s.name.toLowerCase() === name.toLowerCase())) {
      alert('Sticker with this name already exists.'); return;
    }
    
    const now = new Date();
    const dateString = now.toISOString().split('T')[0];
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    inventory.push({
      name, label, totalStock: stock, remainingStock: stock,
      costPerSticker: cost, usage: [],
      transactions: [{
        type: "add",
        amount: stock,
        balance: stock,
        date: dateString,
        time: timeString,
        person: "System",
        invoice: "INITIAL"
      }]
    });
    saveInventory().then(() => {
      updateSelectors();
      updateReport();
      clearStickerForm();
    });
  }
  function clearStickerForm() {
    document.getElementById("stickerName").value = "";
    document.getElementById("stickerLabel").value = "";
    document.getElementById("initialStock").value = "";
    document.getElementById("stickerCost").value = "";
    document.getElementById("addStickerBtn").disabled = true;
  }
  function editSticker(i) {
    editIndex = i;
    let s = inventory[i];
    document.getElementById("stickerName").value = s.name;
    document.getElementById("stickerLabel").value = s.label || "";
    document.getElementById("initialStock").value = s.totalStock;
    document.getElementById("stickerCost").value = s.costPerSticker;
    document.getElementById("addStickerBtn").innerHTML = '<i class="fas fa-edit"></i> Update Sticker';
    document.getElementById("addStickerBtn").onclick = updateSticker;
    document.getElementById("addStickerBtn").disabled = false;
  }
  function updateSticker() {
    if (editIndex < 0) return;
    const name = document.getElementById("stickerName").value.trim();
    const label = document.getElementById("stickerLabel").value;
    const stock = parseInt(document.getElementById("initialStock").value);
    const cost = parseFloat(document.getElementById("stickerCost").value) || 0;
    if (!name || !label || isNaN(stock) || stock < 0) {
      alert("Please enter valid sticker name, label and stock."); return;
    }
    if (inventory.some((s, idx) => idx !== editIndex && s.name && s.name.toLowerCase() === name.toLowerCase())) {
      alert('Sticker with this name already exists.'); return;
    }
    let s = inventory[editIndex];
    s.name = name; s.label = label; s.totalStock = stock;
    let used = s.totalStock - s.remainingStock;
    s.remainingStock = Math.max(0, stock - used);
    s.costPerSticker = cost;
    saveInventory().then(() => {
      editIndex = -1;
      updateSelectors();
      updateReport();
      document.getElementById("addStickerBtn").innerHTML = '<i class="fas fa-plus"></i> Add Sticker';
      document.getElementById("addStickerBtn").onclick = addSticker;
      clearStickerForm();
    });
  }
  function deleteSticker(i) {
    if (!confirm("⚠️ Delete sticker and ALL usage records?")) return;
    inventory.splice(i, 1);
    saveInventory().then(() => {
      updateSelectors();
      updateReport();
    });
  }
  function deductStock() {
    const deductBtn = document.getElementById("deductBtn");
    if (!deductBtn || deductBtn.disabled) return;
    deductBtn.disabled = true;
    if (inventory.length === 0) {
      alert("No stickers in inventory.");
      deductBtn.disabled = false;
      return;
    }
    const index = parseInt(document.getElementById("selectSticker").value);
    const department = document.getElementById("department").value;
    const person = document.getElementById("person").value.trim();
    const date = document.getElementById("deductDate").value;
    const amount = parseInt(document.getElementById("deductAmount").value);
    if (isNaN(index) || index < 0 || index >= inventory.length || !department || !person || !date || isNaN(amount) || amount <= 0) {
      alert("Please fill in all fields correctly.");
      deductBtn.disabled = false;
      return;
    }
    const item = inventory[index];
    if (amount > item.remainingStock) {
      alert(`Not enough stock. Only ${item.remainingStock} left.`);
      deductBtn.disabled = false;
      return;
    }
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    item.remainingStock -= amount;
    item.usage.push({ department, amount, person, date, time: timeString });
    
    // ALSO log to transactions
    if (!item.transactions) item.transactions = [];
    item.transactions.push({
      type: "deduct",
      amount: amount,
      balance: item.remainingStock,
      date: date,
      time: timeString,
      person: person,
      department: department
    });
    
    saveInventory().then(() => {
      updateReport();
      document.getElementById("selectSticker").value = "";
      document.getElementById("department").value = "";
      document.getElementById("person").value = "";
      document.getElementById("deductDate").value = new Date().toISOString().split('T')[0];
      document.getElementById("deductAmount").value = "";
    }).catch(error => {
        console.error("Error saving deduction:", error);
        alert("An error occurred. The deduction might not have been saved.");
    }).finally(() => {
        if (deductBtn) {
            deductBtn.disabled = false;
            validateDeduct();
        }
    });
  }
  function updateSelectors() {
    const select = document.getElementById("selectSticker");
    select.innerHTML = "";
    let placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "--Select Sticker--";
    select.appendChild(placeholder);
    inventory.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = item.label || item.name || 'Sticker';
      select.appendChild(option);
    });
    applyRolePermissions();
  }
  function updateReport() {
    const reportTableBody = document.querySelector("#reportTable tbody");
    reportTableBody.innerHTML = "";
    if (inventory.length === 0) {
      reportTableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px; font-size: 1.2rem;">No sticker data available. Please add a new sticker.</td></tr>`;
      return;
    }
    inventory.forEach((item, index) => {
      const row = reportTableBody.insertRow();
      let totalUsed = 0;
      let lastUsedDate = "N/A";
      let lastUsedPerson = "N/A";
      let lastUsedTime = "N/A";
      if (item.usage && item.usage.length > 0) {
        totalUsed = item.usage.reduce((sum, u) => sum + u.amount, 0);
        const sortedUsage = [...item.usage].sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          if (dateA.getTime() !== dateB.getTime()) return dateB.getTime() - dateA.getTime();
          if (a.time && b.time) return b.time.localeCompare(a.time);
          return b.amount - a.amount;
        });
        const lastUsage = sortedUsage[0];
        lastUsedDate = lastUsage.date;
        lastUsedPerson = lastUsage.person;
        lastUsedTime = lastUsage.time || "N/A";
      }
      let rowClass = "";
      if (item.remainingStock === 0) rowClass = "out-stock";
      else if (item.remainingStock <= 5) rowClass = "low-stock";
      if (rowClass) row.classList.add(rowClass);
      row.innerHTML = `
        <td style="font-weight: 500;">${item.label || item.name || 'N/A'}</td>
        <td>${totalUsed}</td>
        <td style="font-weight: 600;">${item.remainingStock}</td>
        <td>${item.totalStock}</td>
        <td class="admin-price">R${item.costPerSticker ? item.costPerSticker.toFixed(2) : '0.00'}</td>
        <td class="admin-price">R${(item.totalStock * (item.costPerSticker || 0)).toFixed(2)}</td>
        <td>${lastUsedDate}<br><small style="opacity: 0.8;">${lastUsedTime}</small></td>
        <td>${lastUsedPerson}</td>
        <td class="admin-only">
          <button class="action-btn eye-btn" onclick="showUsageModal(${index})" title="View Usage Log"><i class="fas fa-eye"></i></button>
          <button class="action-btn" onclick="showAddStockModal(${index})" title="Add Stock"><i class="fas fa-plus"></i></button>
          <button class="action-btn edit-btn" onclick="editSticker(${index})" title="Edit Sticker"><i class="fas fa-edit"></i></button>
          <button class="action-btn del-btn" onclick="deleteSticker(${index})" title="Delete Sticker"><i class="fas fa-trash"></i></button>
        </td>
      `;
    });
    applyRolePermissions();
  }
  function showAddStockModal(i) {
    addStockIndex = i;
    document.getElementById('addStockStickerName').textContent = inventory[i].label || inventory[i].name;
    document.getElementById('addStockAmount').value = "";
    document.getElementById('addStockPerson').value = "";
    document.getElementById('addStockInvoice').value = "";
    document.getElementById('addStockModal').style.display = 'flex';
    setTimeout(()=>{document.getElementById('addStockPerson').focus()},250);
  }
  function hideAddStockModal() {
    document.getElementById('addStockModal').style.display = 'none';
    addStockIndex = -1;
  }
  function addStockToSticker() {
    const amt = parseInt(document.getElementById('addStockAmount').value);
    const person = document.getElementById('addStockPerson').value.trim();
    const invoice = document.getElementById('addStockInvoice').value.trim();

    if (isNaN(amt) || amt <= 0) { alert("Enter a valid amount."); return; }
    if (!person) { alert("Please enter the name of the person adding stock."); return; }
    if (!invoice) { alert("Please enter an invoice number."); return; }

    const now = new Date();
    const dateString = now.toISOString().split('T')[0];
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = inventory[addStockIndex];
    const newBalance = item.remainingStock + amt;

    item.totalStock += amt;
    item.remainingStock = newBalance;

    if (!item.transactions) item.transactions = [];
    item.transactions.push({
      type: "add",
      amount: amt,
      balance: newBalance,
      date: dateString,
      time: timeString,
      person: person,
      invoice: invoice
    });

    saveInventory().then(() => {
      updateReport();
      hideAddStockModal();
    });
  }
  function showUsageModal(idx) {
    usageModalIndex = idx;
    const sticker = inventory[idx];
    let html = "";
    if (sticker.usage && sticker.usage.length) {
      html += `<table id="usageListTable"><thead><tr>
        <th>Date</th><th>Time</th><th>Person</th><th>Dept</th><th>Amt</th>
        <th class="admin-only">Actions</th>
      </tr></thead><tbody>`;
      sticker.usage.slice().reverse().forEach(u => {
        html += `<tr>
          <td>${u.date}</td>
          <td>${u.time || 'N/A'}</td>
          <td>${u.person}</td>
          <td>${u.department.charAt(0).toUpperCase() + u.department.slice(1)}</td>
          <td>${u.amount}</td>
          <td class="admin-only">
            <button class="action-btn del-btn" onclick="deleteUsage(${idx}, '${u.date}', '${u.time || ''}', '${u.person}', '${u.department}', ${u.amount})" title="Delete Usage"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
      });
      html += "</tbody></table>";
    } else {
      html = `<p class="text-center" style="font-size: 1.1rem; padding: 20px;">No usage log found for this sticker.</p>`;
    }
    document.getElementById('usageListContent').innerHTML = html;
    document.getElementById('usageModal').style.display = 'flex';
  }
  function hideUsageModal() {
    document.getElementById('usageModal').style.display = 'none';
    usageModalIndex = -1;
  }
  function deleteUsage(stickerIndex, date, time, person, department, amount) {
    if (!confirm("Delete this usage record?")) return;
    if (userRole !== "admin") {
      alert("Only admins can delete usage records.");
      return;
    }
    const sticker = inventory[stickerIndex];
    const usageIndex = sticker.usage.findIndex(u =>
      u.date === date &&
      u.time === time &&
      u.person === person &&
      u.department === department &&
      u.amount === amount
    );
    if (usageIndex !== -1) {
      sticker.usage.splice(usageIndex, 1);
      sticker.remainingStock += amount;
      
      // Also remove from transactions
      const txIndex = sticker.transactions.findIndex(t =>
        t.type === "deduct" &&
        t.date === date &&
        t.time === time &&
        t.person === person &&
        t.department === department &&
        t.amount === amount
      );
      if (txIndex !== -1) {
        sticker.transactions.splice(txIndex, 1);
        // Recalculate balances if needed (optional, for safety)
      }
      
      saveInventory().then(() => {
        updateReport();
        showUsageModal(stickerIndex);
      });
    }
  }
  
  // ====== FULL PAGE STATISTICS DASHBOARD ======
  function showFullPageStats() {
    document.getElementById('fullPageStats').style.display = 'block';
    showFullStatsTab('daily');
  }
  
  function hideFullPageStats() {
    document.getElementById('fullPageStats').style.display = 'none';
  }
  
  function refreshFullStats() {
    const activeTab = document.querySelector('#fullStatsTabs button.active');
    const tabId = activeTab ? activeTab.id.replace('full-tab-', '') : 'daily';
    showFullStatsTab(tabId);
  }
  
  function showFullStatsTab(tab) {
    // Update active tab
    ['daily', 'weekly', 'monthly', 'last-month', 'last-week', 'all'].forEach(x => {
      document.getElementById('full-tab-' + x).classList.remove('active');
    });
    document.getElementById('full-tab-' + tab).classList.add('active');
    
    // Calculate date range
    let now = new Date();
    let startDate, endDate, periodName;
    
    if (tab === "daily") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      periodName = "Today";
    } else if (tab === "weekly") {
      const day = now.getDay() || 7;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      periodName = "This Week";
    } else if (tab === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      periodName = "This Month";
    } else if (tab === "last-month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
      periodName = "Last Month";
    } else if (tab === "last-week") {
      const day = now.getDay() || 7;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1 - 7);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      periodName = "Last Week";
    } else if (tab === "all") {
      startDate = new Date(2000, 0, 1);
      endDate = new Date(now.getFullYear() + 10, 0, 1);
      periodName = "All Time";
    }
    
    // Collect comprehensive statistics
    const stats = calculateComprehensiveStats(startDate, endDate);
    
    // Build full-page stats HTML
    let html = '';
    
    if (stats.totalTransactions === 0) {
      html = `
        <div class="empty-state" style="padding: 100px 20px;">
          <i class="fas fa-chart-network" style="font-size: 4rem;"></i>
          <h3 style="margin: 20px 0 10px; color: var(--text-secondary);">No Usage Data</h3>
          <p>No sticker usage recorded for ${periodName.toLowerCase()}.</p>
          <p style="margin-top: 20px; font-size: 0.9rem; color: var(--text-secondary);">
            Try selecting a different time period.
          </p>
        </div>
      `;
    } else {
      // Top summary cards
      html += `
        <div class="full-stats-grid">
          <div class="full-stat-item">
            <div class="full-stat-label">Total Used</div>
            <div class="full-stat-number">${stats.totalUsed}</div>
            <div class="full-stat-unit">stickers</div>
          </div>
          <div class="full-stat-item">
            <div class="full-stat-label">Departments</div>
            <div class="full-stat-number">${stats.departmentsCount}</div>
            <div class="full-stat-unit">active</div>
          </div>
          <div class="full-stat-item">
            <div class="full-stat-label">Label Types</div>
            <div class="full-stat-number">${stats.labelsCount}</div>
            <div class="full-stat-unit">used</div>
          </div>
          ${userRole === "admin" ? `
          <div class="full-stat-item">
            <div class="full-stat-label">Total Cost</div>
            <div class="full-stat-number">R${stats.totalCost.toFixed(2)}</div>
            <div class="full-stat-unit">spent</div>
          </div>
          ` : ''}
          <div class="full-stat-item">
            <div class="full-stat-label">Transactions</div>
            <div class="full-stat-number">${stats.totalTransactions}</div>
            <div class="full-stat-unit">records</div>
          </div>
          <div class="full-stat-item">
            <div class="full-stat-label">Avg Daily</div>
            <div class="full-stat-number">${stats.averageDailyUsage}</div>
            <div class="full-stat-unit">stickers/day</div>
          </div>
        </div>
      `;
      
      // Department Usage Chart
      const topDepts = Object.keys(stats.departmentStats)
        .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
        .slice(0, 8);
      const maxDeptUsage = topDepts.length > 0 ? 
        Math.max(...topDepts.map(dept => stats.departmentStats[dept].used)) : 0;
      
      html += `
        <div class="full-stats-container">
          <!-- Department Usage Card -->
          <div class="full-stats-card wide">
            <div class="stats-header">
              <i class="fas fa-building"></i>
              <h4>Department Usage</h4>
            </div>
            
            ${topDepts.length > 0 ? `
            <div class="full-chart-container">
              <div class="full-bar-chart">
                ${topDepts.map(dept => {
                  const usage = stats.departmentStats[dept].used;
                  const percentage = maxDeptUsage > 0 ? (usage / maxDeptUsage * 100) : 0;
                  const minPct = Math.max(percentage, 3);
                  const shortName = dept.length > 12 ? dept.substring(0, 10) + '..' : dept;
                  return `
                    <div class="full-bar" style="height: ${minPct}%" 
                         title="${dept}: ${usage} stickers (${((usage / stats.totalUsed) * 100).toFixed(1)}%)">
                      <div class="full-bar-value">${usage}</div>
                      <div class="full-bar-label">${shortName}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            
            <table class="full-data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Used</th>
                  <th>% of Total</th>
                  ${userRole === "admin" ? '<th>Cost</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${Object.keys(stats.departmentStats)
                  .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
                  .map(dept => {
                    const percentage = stats.totalUsed > 0 ? ((stats.departmentStats[dept].used / stats.totalUsed) * 100).toFixed(1) : 0;
                    return `
                      <tr>
                        <td style="font-weight: 600;">${dept.charAt(0).toUpperCase() + dept.slice(1)}</td>
                        <td style="font-weight: 700;">${stats.departmentStats[dept].used}</td>
                        <td style="color: var(--accent-secondary); font-weight: 600;">${percentage}%</td>
                        ${userRole === "admin" ? `<td style="font-weight: 600;">R${stats.departmentStats[dept].cost.toFixed(2)}</td>` : ''}
                      </tr>
                    `;
                  }).join('')}
              </tbody>
            </table>
            ` : `
            <div class="empty-state" style="padding: 40px;">
              <i class="fas fa-building"></i>
              <p>No department usage data</p>
            </div>
            `}
          </div>
          
          <!-- Label Usage Card -->
          <div class="full-stats-card wide">
            <div class="stats-header">
              <i class="fas fa-tags"></i>
              <h4>Label Type Usage</h4>
            </div>
            
            ${stats.topLabels.length > 0 ? `
            <div class="full-chart-container">
              <div class="full-bar-chart">
                ${stats.topLabels.slice(0, 8).map(label => {
                  const usage = stats.labelUsedStats[label];
                  const percentage = stats.maxLabelUsage > 0 ? (usage / stats.maxLabelUsage * 100) : 0;
                  const minPct = Math.max(percentage, 3);
                  const shortName = label.length > 12 ? label.substring(0, 10) + '..' : label;
                  return `
                    <div class="full-bar" style="height: ${minPct}%; background: linear-gradient(180deg, var(--accent-secondary) 0%, var(--accent-secondary-hover) 100%);" 
                         title="${label}: ${usage} stickers">
                      <div class="full-bar-value" style="color: var(--accent-secondary);">${usage}</div>
                      <div class="full-bar-label">${shortName}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            
            <table class="full-data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Used</th>
                  <th>% of Total</th>
                  <th>Avg Daily</th>
                </tr>
              </thead>
              <tbody>
                ${stats.sortedLabels.map(label => {
                  const percentage = stats.totalUsed > 0 ? ((stats.labelUsedStats[label] / stats.totalUsed) * 100).toFixed(1) : 0;
                  const avgDaily = stats.daysInPeriod > 0 ? (stats.labelUsedStats[label] / stats.daysInPeriod).toFixed(1) : stats.labelUsedStats[label];
                  return `
                    <tr>
                      <td style="font-weight: 600;">${label}</td>
                      <td style="font-weight: 700;">${stats.labelUsedStats[label]}</td>
                      <td style="color: var(--accent-secondary); font-weight: 600;">${percentage}%</td>
                      <td style="color: var(--accent-tertiary); font-weight: 600;">${avgDaily}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ` : `
            <div class="empty-state" style="padding: 40px;">
              <i class="fas fa-tags"></i>
              <p>No label usage data</p>
            </div>
            `}
          </div>
          
          <!-- Daily Trends Card -->
          <div class="full-stats-card">
            <div class="stats-header">
              <i class="fas fa-chart-line"></i>
              <h4>Daily Trends</h4>
            </div>
            
            <div class="stats-metric">
              <span class="metric-label"><i class="fas fa-fire"></i> Peak Day</span>
              <span class="metric-value">${stats.peakDay.usage} (${stats.peakDay.date})</span>
            </div>
            
            <div class="stats-metric">
              <span class="metric-label"><i class="fas fa-calculator"></i> Average Daily</span>
              <span class="metric-value">${stats.averageDailyUsage}</span>
            </div>
            
            <div class="stats-metric">
              <span class="metric-label"><i class="fas fa-calendar-check"></i> Active Days</span>
              <span class="metric-value">${stats.activeDays}</span>
            </div>
            
            ${userRole === "admin" && stats.daysInPeriod > 1 ? `
            <div class="stats-metric">
              <span class="metric-label"><i class="fas fa-money-bill-wave"></i> Daily Cost Avg</span>
              <span class="metric-value">R${(stats.totalCost / stats.daysInPeriod).toFixed(2)}</span>
            </div>
            ` : ''}
            
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">
              <p style="color: var(--text-secondary); font-size: 0.9rem;">
                <i class="fas fa-info-circle"></i> Based on ${stats.daysInPeriod} days in period
              </p>
            </div>
          </div>
          
          <!-- Department Comparison Card -->
          <div class="full-stats-card">
            <div class="stats-header">
              <i class="fas fa-balance-scale"></i>
              <h4>Department Comparison</h4>
            </div>
            
            <div class="comparison-grid">
              ${Object.keys(stats.departmentStats)
                .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
                .slice(0, 4)
                .map(dept => {
                  const usage = stats.departmentStats[dept].used;
                  const percentage = stats.totalUsed > 0 ? ((usage / stats.totalUsed) * 100).toFixed(1) : 0;
                  return `
                    <div class="comparison-card">
                      <h5 style="margin: 0 0 10px 0; color: var(--accent-primary);">${dept.charAt(0).toUpperCase() + dept.slice(1)}</h5>
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 2rem; font-weight: 800; color: var(--accent-primary);">${usage}</span>
                        <span style="background: var(--accent-primary-light); color: var(--accent-primary); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600;">${percentage}%</span>
                      </div>
                      <div style="margin-top: 10px; height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${percentage}%; height: 100%; background: var(--accent-primary);"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
            </div>
          </div>
          
          <!-- Detailed Breakdown Card -->
          <div class="full-stats-card wide">
            <div class="stats-header">
              <i class="fas fa-list-ol"></i>
              <h4>Detailed Breakdown</h4>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; margin-top: 20px;">
              <div>
                <h5 style="margin: 0 0 15px 0; color: var(--accent-primary); font-size: 1.1rem;">
                  <i class="fas fa-chart-pie"></i> Usage Distribution
                </h5>
                ${Object.keys(stats.departmentStats)
                  .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
                  .map(dept => {
                    const percentage = stats.totalUsed > 0 ? ((stats.departmentStats[dept].used / stats.totalUsed) * 100).toFixed(1) : 0;
                    return `
                      <div class="stats-metric">
                        <span class="metric-label">
                          <i class="fas fa-circle" style="color: var(--accent-primary); font-size: 0.7rem;"></i> ${dept}
                        </span>
                        <span class="metric-value">${percentage}%</span>
                      </div>
                    `;
                  }).join('')}
              </div>
              
              <div>
                <h5 style="margin: 0 0 15px 0; color: var(--accent-primary); font-size: 1.1rem;">
                  <i class="fas fa-tachometer-alt"></i> Performance Metrics
                </h5>
                <div class="stats-metric">
                  <span class="metric-label"><i class="fas fa-bolt"></i> Usage Rate</span>
                  <span class="metric-value">${stats.averageDailyUsage}/day</span>
                </div>
                <div class="stats-metric">
                  <span class="metric-label"><i class="fas fa-layer-group"></i> Coverage</span>
                  <span class="metric-value">${((stats.activeDays / stats.daysInPeriod) * 100).toFixed(0)}% days active</span>
                </div>
                <div class="stats-metric">
                  <span class="metric-label"><i class="fas fa-project-diagram"></i> Diversity</span>
                  <span class="metric-value">${stats.labelsCount} labels</span>
                </div>
                ${userRole === "admin" ? `
                <div class="stats-metric">
                  <span class="metric-label"><i class="fas fa-money-bill"></i> Efficiency</span>
                  <span class="metric-value">R${(stats.totalCost / stats.totalUsed).toFixed(3)}/sticker</span>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Export Section -->
        <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid var(--border-color);">
          <div style="text-align: center;">
            <h3 style="color: var(--accent-primary); margin-bottom: 20px;">
              <i class="fas fa-download"></i> Export Full Report
            </h3>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
              <button class="export-btn" onclick="exportFullStatsReport('${tab}', '${startDate.toISOString()}', '${endDate.toISOString()}')">
                <i class="fas fa-file-csv"></i> Export CSV Report
              </button>
              <button class="export-btn" onclick="exportFullStatsPDF('${tab}', '${startDate.toISOString()}', '${endDate.toISOString()}')" style="background: var(--accent-danger); border-color: var(--accent-danger);">
                <i class="fas fa-file-pdf"></i> Export PDF Report
              </button>
            </div>
            <p style="margin-top: 15px; color: var(--text-secondary); font-size: 0.9rem;">
              <i class="fas fa-info-circle"></i> Period: ${periodName} (${formatDateRange(startDate, endDate)})
            </p>
          </div>
        </div>
      `;
    }
    
    document.getElementById('fullStatsContent').innerHTML = html;
  }
  
  function calculateComprehensiveStats(startDate, endDate) {
    let departmentStats = {};
    let labelUsedStats = {};
    let dailyUsage = {};
    let totalUsed = 0;
    let totalCost = 0;
    let totalTransactions = 0;
    let departments = new Set();
    let labels = new Set();
    
    // Calculate days in period
    const daysInPeriod = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    
    inventory.forEach(item => {
      item.usage.forEach(u => {
        let usageDate = new Date(u.date);
        if (usageDate >= startDate && usageDate < endDate) {
          // Department stats
          if (!departmentStats[u.department]) departmentStats[u.department] = { used: 0, cost: 0 };
          departmentStats[u.department].used += u.amount;
          departmentStats[u.department].cost += u.amount * (item.costPerSticker || 0);
          
          // Label stats
          const label = item.label || item.name;
          if (!labelUsedStats[label]) labelUsedStats[label] = 0;
          labelUsedStats[label] += u.amount;
          
          // Daily usage stats
          const dateKey = u.date;
          if (!dailyUsage[dateKey]) dailyUsage[dateKey] = 0;
          dailyUsage[dateKey] += u.amount;
          
          // Totals
          totalUsed += u.amount;
          totalCost += u.amount * (item.costPerSticker || 0);
          totalTransactions++;
          departments.add(u.department);
          labels.add(label);
        }
      });
    });
    
    // Find peak day
    let peakDay = { date: "N/A", usage: 0 };
    Object.keys(dailyUsage).forEach(date => {
      if (dailyUsage[date] > peakDay.usage) {
        peakDay = { date, usage: dailyUsage[date] };
      }
    });
    
    // Calculate averages
    const activeDays = Object.keys(dailyUsage).length;
    const averageDailyUsage = activeDays > 0 ? (totalUsed / activeDays).toFixed(1) : "0.0";
    
    // Sort labels by usage
    const sortedLabels = Object.keys(labelUsedStats).sort((a, b) => 
      labelUsedStats[b] - labelUsedStats[a]
    );
    
    const topLabels = sortedLabels.slice(0, 10);
    const maxLabelUsage = topLabels.length > 0 ? 
      Math.max(...topLabels.map(label => labelUsedStats[label])) : 0;
    
    return {
      totalUsed,
      totalCost,
      totalTransactions,
      departmentsCount: departments.size,
      labelsCount: labels.size,
      departmentStats,
      labelUsedStats,
      sortedLabels,
      topLabels,
      maxLabelUsage,
      dailyUsage,
      peakDay,
      activeDays,
      daysInPeriod,
      averageDailyUsage
    };
  }
  
  function formatDateRange(startDate, endDate) {
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    
    const endDateForDisplay = new Date(endDate.getTime() - 86400000);
    return `${formatDate(startDate)} to ${formatDate(endDateForDisplay)}`;
  }
  
  function exportFullStatsReport(tab, startDateISO, endDateISO) {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    const stats = calculateComprehensiveStats(startDate, endDate);
    
    const periodNames = {
      'daily': 'Today',
      'weekly': 'This Week',
      'monthly': 'This Month',
      'last-week': 'Last Week',
      'last-month': 'Last Month',
      'all': 'All Time'
    };
    
    let csv = `FULL STATISTICS REPORT - ${periodNames[tab]}\n`;
    csv += `Period: ${formatDateRange(startDate, endDate)}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    csv += "SUMMARY\n";
    csv += `Total Stickers Used,${stats.totalUsed}\n`;
    csv += `Total Cost,R${stats.totalCost.toFixed(2)}\n`;
    csv += `Total Transactions,${stats.totalTransactions}\n`;
    csv += `Active Departments,${stats.departmentsCount}\n`;
    csv += `Label Types Used,${stats.labelsCount}\n`;
    csv += `Active Days,${stats.activeDays}/${stats.daysInPeriod}\n`;
    csv += `Average Daily Usage,${stats.averageDailyUsage}\n`;
    csv += `Peak Day,${stats.peakDay.date} (${stats.peakDay.usage} stickers)\n\n`;
    
    csv += "DEPARTMENT USAGE DETAILS\n";
    csv += "Department,Stickers Used,Total Cost,Percentage\n";
    Object.keys(stats.departmentStats)
      .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
      .forEach(dept => {
        const percentage = stats.totalUsed > 0 ? ((stats.departmentStats[dept].used / stats.totalUsed) * 100).toFixed(2) : 0;
        csv += `"${dept}",${stats.departmentStats[dept].used},R${stats.departmentStats[dept].cost.toFixed(2)},${percentage}%\n`;
      });
    
    csv += "\nLABEL TYPE USAGE DETAILS\n";
    csv += "Label,Stickers Used,Percentage,Avg Daily\n";
    stats.sortedLabels.forEach(label => {
      const percentage = stats.totalUsed > 0 ? ((stats.labelUsedStats[label] / stats.totalUsed) * 100).toFixed(2) : 0;
      const avgDaily = stats.daysInPeriod > 0 ? (stats.labelUsedStats[label] / stats.daysInPeriod).toFixed(2) : stats.labelUsedStats[label];
      csv += `"${label}",${stats.labelUsedStats[label]},${percentage}%,${avgDaily}\n`;
    });
    
    csv += "\nDAILY USAGE BREAKDOWN\n";
    csv += "Date,Stickers Used\n";
    Object.keys(stats.dailyUsage)
      .sort()
      .forEach(date => {
        csv += `${date},${stats.dailyUsage[date]}\n`;
      });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `full_stats_${tab}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  function exportFullStatsPDF(tab, startDateISO, endDateISO) {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    const stats = calculateComprehensiveStats(startDate, endDate);
    
    const periodNames = {
      'daily': 'Today',
      'weekly': 'This Week',
      'monthly': 'This Month',
      'last-week': 'Last Week',
      'last-month': 'Last Month',
      'all': 'All Time'
    };
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(27, 79, 114);
    doc.text('Full Statistics Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${periodNames[tab]} (${formatDateRange(startDate, endDate)})`, 105, 30, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 36, { align: 'center' });
    
    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(27, 79, 114);
    doc.text('Summary', 14, 50);
    
    const summaryData = [
      ['Total Stickers Used', stats.totalUsed],
      ['Total Cost', `R${stats.totalCost.toFixed(2)}`],
      ['Total Transactions', stats.totalTransactions],
      ['Active Departments', stats.departmentsCount],
      ['Label Types Used', stats.labelsCount],
      ['Average Daily Usage', stats.averageDailyUsage]
    ];
    
    doc.autoTable({
      startY: 55,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [27, 79, 114] },
      styles: { fontSize: 10 }
    });
    
    // Department Usage
    const deptData = Object.keys(stats.departmentStats)
      .sort((a, b) => stats.departmentStats[b].used - stats.departmentStats[a].used)
      .map(dept => [
        dept,
        stats.departmentStats[dept].used,
        `R${stats.departmentStats[dept].cost.toFixed(2)}`,
        `${((stats.departmentStats[dept].used / stats.totalUsed) * 100).toFixed(1)}%`
      ]);
    
    doc.setFontSize(14);
    doc.setTextColor(27, 79, 114);
    doc.text('Department Usage', 14, doc.lastAutoTable.finalY + 10);
    
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 15,
      head: [['Department', 'Used', 'Cost', '% of Total']],
      body: deptData,
      theme: 'grid',
      headStyles: { fillColor: [27, 79, 114] },
      styles: { fontSize: 9 }
    });
    
    // Save PDF
    doc.save(`full_stats_${tab}_${new Date().toISOString().split('T')[0]}.pdf`);
  }
  
  function exportFullStats() {
    const activeTab = document.querySelector('#fullStatsTabs button.active');
    const tabId = activeTab ? activeTab.id.replace('full-tab-', '') : 'daily';
    exportFullStatsReport(tabId, new Date(2000, 0, 1).toISOString(), new Date().toISOString());
  }
  
  // ====== ENHANCED STATS MODAL ======
  function showStatsModal() {
    document.getElementById('statsModal').style.display = 'flex';
    showStatsTab('daily');
  }
  
  function hideStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
  }
  
  function showStatsTab(tab) {
    // Update active tab
    ['daily', 'weekly', 'monthly', 'last-month', 'last-week'].forEach(x => {
      document.getElementById('tab-' + x).classList.remove('active');
    });
    document.getElementById('tab-' + tab).classList.add('active');
    
    // Update period indicator
    const periodNames = {
      'daily': 'Today',
      'weekly': 'This Week',
      'monthly': 'This Month',
      'last-week': 'Last Week',
      'last-month': 'Last Month'
    };
    document.getElementById('periodIndicator').textContent = periodNames[tab];
    
    // Calculate date range
    let now = new Date();
    let startDate, endDate;
    if (tab === "daily") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (tab === "weekly") {
      const day = now.getDay() || 7;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (tab === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (tab === "last-month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (tab === "last-week") {
      const day = now.getDay() || 7;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1 - 7);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    }
    
    // Collect statistics
    let departmentStats = {};
    let labelUsedStats = {};
    let totalUsed = 0;
    let totalCost = 0;
    let totalTransactions = 0;
    let departmentsWithUsage = new Set();
    let labelsWithUsage = new Set();
    
    inventory.forEach(item => {
      item.usage.forEach(u => {
        let d = new Date(u.date);
        if (d >= startDate && d < endDate) {
          // Department stats
          if (!departmentStats[u.department]) departmentStats[u.department] = { used: 0, cost: 0 };
          departmentStats[u.department].used += u.amount;
          departmentStats[u.department].cost += u.amount * (item.costPerSticker || 0);
          
          // Label stats
          const label = item.label || item.name;
          if (!labelUsedStats[label]) labelUsedStats[label] = 0;
          labelUsedStats[label] += u.amount;
          
          // Totals
          totalUsed += u.amount;
          totalCost += u.amount * (item.costPerSticker || 0);
          totalTransactions++;
          departmentsWithUsage.add(u.department);
          labelsWithUsage.add(label);
        }
      });
    });
    
    // Format dates for display
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    const periodDisplay = tab === 'daily' 
      ? formatDate(startDate)
      : tab === 'weekly' || tab === 'last-week'
      ? `${formatDate(startDate)} - ${formatDate(new Date(endDate.getTime() - 86400000))}`
      : startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Build enhanced stats HTML
    let html = '';
    
    if (totalTransactions === 0) {
      html = `
        <div class="empty-state">
          <i class="fas fa-chart-bar"></i>
          <h4 style="margin: 15px 0 10px; color: var(--text-secondary);">No Usage Data</h4>
          <p>No sticker usage recorded for ${periodNames[tab].toLowerCase()}.</p>
          <p style="margin-top: 20px; font-size: 0.9rem; color: var(--text-secondary);">
            Period: ${periodDisplay}
          </p>
        </div>
      `;
    } else {
      // Sort departments by usage (descending)
      const sortedDepartments = Object.keys(departmentStats).sort((a, b) => 
        departmentStats[b].used - departmentStats[a].used
      );
      
      // Sort labels by usage (descending)
      const sortedLabels = Object.keys(labelUsedStats).sort((a, b) => 
        labelUsedStats[b] - labelUsedStats[a]
      );
      
      // Top 5 departments for chart
      const topDepartments = sortedDepartments.slice(0, 5);
      const maxDeptUsage = topDepartments.length > 0 ? 
        Math.max(...topDepartments.map(dept => departmentStats[dept].used)) : 0;
      
      // Top 5 labels for chart
      const topLabels = sortedLabels.slice(0, 5);
      const maxLabelUsage = topLabels.length > 0 ? 
        Math.max(...topLabels.map(label => labelUsedStats[label])) : 0;
      
      html = `
        <div class="stats-container">
          <!-- Summary Card -->
          <div class="stats-card">
            <div class="stats-header">
              <i class="fas fa-chart-pie"></i>
              <h4>Summary</h4>
            </div>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-label">Total Used</div>
                <div class="stat-number">${totalUsed}</div>
                <div class="stat-unit">stickers</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Departments</div>
                <div class="stat-number">${departmentsWithUsage.size}</div>
                <div class="stat-unit">active</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Label Types</div>
                <div class="stat-number">${labelsWithUsage.size}</div>
                <div class="stat-unit">used</div>
              </div>
              ${userRole === "admin" ? `
              <div class="stat-item">
                <div class="stat-label">Total Cost</div>
                <div class="stat-number">R${totalCost.toFixed(2)}</div>
                <div class="stat-unit">spent</div>
              </div>
              ` : ''}
            </div>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">
              <div class="stats-metric">
                <span class="metric-label"><i class="fas fa-calendar-alt"></i> Period</span>
                <span class="metric-value">${periodDisplay}</span>
              </div>
              <div class="stats-metric">
                <span class="metric-label"><i class="fas fa-exchange-alt"></i> Transactions</span>
                <span class="metric-value">${totalTransactions}</span>
              </div>
            </div>
          </div>
          
          <!-- Top Departments Card -->
          <div class="stats-card">
            <div class="stats-header">
              <i class="fas fa-building"></i>
              <h4>Top Departments</h4>
            </div>
            
            ${topDepartments.length > 0 ? `
            <div class="chart-container">
              <div class="bar-chart">
                ${topDepartments.map(dept => {
                  const usage = departmentStats[dept].used;
                  const percentage = maxDeptUsage > 0 ? (usage / maxDeptUsage * 100) : 0;
                  const minPct = Math.max(percentage, 3);
                  const shortName = dept.length > 10 ? dept.substring(0, 8) + '..' : dept;
                  return `
                    <div class="bar" style="height: ${minPct}%" 
                         title="${dept}: ${usage} stickers">
                      <div class="bar-value">${usage}</div>
                      <div class="bar-label">${shortName}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Used</th>
                  ${userRole === "admin" ? '<th>Cost</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${sortedDepartments.map(dept => `
                  <tr>
                    <td style="font-weight: 500;">${dept.charAt(0).toUpperCase() + dept.slice(1)}</td>
                    <td style="font-weight: 600;">${departmentStats[dept].used}</td>
                    ${userRole === "admin" ? `<td style="font-weight: 600;">R${departmentStats[dept].cost.toFixed(2)}</td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ` : `
            <div class="empty-state" style="padding: 20px;">
              <i class="fas fa-building"></i>
              <p>No department usage data</p>
            </div>
            `}
          </div>
          
          <!-- Top Labels Card -->
          <div class="stats-card">
            <div class="stats-header">
              <i class="fas fa-tags"></i>
              <h4>Top Labels</h4>
            </div>
            
            ${topLabels.length > 0 ? `
            <div class="chart-container">
              <div class="bar-chart">
                ${topLabels.map(label => {
                  const usage = labelUsedStats[label];
                  const percentage = maxLabelUsage > 0 ? (usage / maxLabelUsage * 100) : 0;
                  const minPct = Math.max(percentage, 3);
                  const shortName = label.length > 10 ? label.substring(0, 8) + '..' : label;
                  return `
                    <div class="bar" style="height: ${minPct}%; background: linear-gradient(180deg, var(--accent-secondary) 0%, var(--accent-secondary-hover) 100%);" 
                         title="${label}: ${usage} stickers">
                      <div class="bar-value" style="color: var(--accent-secondary);">${usage}</div>
                      <div class="bar-label">${shortName}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            
            <table class="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Used</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                ${sortedLabels.map(label => {
                  const percentage = totalUsed > 0 ? ((labelUsedStats[label] / totalUsed) * 100).toFixed(1) : 0;
                  return `
                    <tr>
                      <td style="font-weight: 500;">${label}</td>
                      <td style="font-weight: 600;">${labelUsedStats[label]}</td>
                      <td style="font-weight: 600; color: var(--accent-secondary);">${percentage}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ` : `
            <div class="empty-state" style="padding: 20px;">
              <i class="fas fa-tags"></i>
              <p>No label usage data</p>
            </div>
            `}
          </div>
        </div>
        
        <!-- Export Button -->
        <div style="margin: 25px 20px 15px 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
          <button class="export-btn" onclick="exportStatsToCSV('${tab}', '${startDate.toISOString()}', '${endDate.toISOString()}')" style="width: 100%;">
            <i class="fas fa-file-csv"></i> Export ${periodNames[tab]} Statistics (CSV)
          </button>
        </div>
      `;
    }
    
    document.getElementById('statsContent').innerHTML = html;
  }
  
  // Export stats function
  function exportStatsToCSV(period, startDateISO, endDateISO) {
    const startDate = new Date(startDateISO);
    const endDate = new Date(endDateISO);
    
    let departmentStats = {};
    let labelUsedStats = {};
    let totalUsed = 0;
    let totalCost = 0;
    
    inventory.forEach(item => {
      item.usage.forEach(u => {
        let d = new Date(u.date);
        if (d >= startDate && d < endDate) {
          if (!departmentStats[u.department]) departmentStats[u.department] = { used: 0, cost: 0 };
          departmentStats[u.department].used += u.amount;
          departmentStats[u.department].cost += u.amount * (item.costPerSticker || 0);
          
          const label = item.label || item.name;
          if (!labelUsedStats[label]) labelUsedStats[label] = 0;
          labelUsedStats[label] += u.amount;
          
          totalUsed += u.amount;
          totalCost += u.amount * (item.costPerSticker || 0);
        }
      });
    });
    
    const periodNames = {
      'daily': 'Today',
      'weekly': 'This Week',
      'monthly': 'This Month',
      'last-week': 'Last Week',
      'last-month': 'Last Month'
    };
    
    let csv = `Sticker Usage Statistics - ${periodNames[period]}\n`;
    csv += `Period: ${startDate.toLocaleDateString()} to ${new Date(endDate.getTime() - 86400000).toLocaleDateString()}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    csv += "SUMMARY\n";
    csv += `Total Stickers Used,${totalUsed}\n`;
    csv += `Total Cost,R${totalCost.toFixed(2)}\n`;
    csv += `Number of Departments,${Object.keys(departmentStats).length}\n`;
    csv += `Number of Label Types,${Object.keys(labelUsedStats).length}\n\n`;
    
    csv += "DEPARTMENT USAGE\n";
    csv += "Department,Stickers Used,Total Cost\n";
    Object.keys(departmentStats).sort((a, b) => departmentStats[b].used - departmentStats[a].used).forEach(dept => {
      csv += `"${dept}",${departmentStats[dept].used},R${departmentStats[dept].cost.toFixed(2)}\n`;
    });
    
    csv += "\nLABEL USAGE\n";
    csv += "Label,Stickers Used,Percentage of Total\n";
    Object.keys(labelUsedStats).sort((a, b) => labelUsedStats[b] - labelUsedStats[a]).forEach(label => {
      const percentage = totalUsed > 0 ? ((labelUsedStats[label] / totalUsed) * 100).toFixed(2) : 0;
      csv += `"${label}",${labelUsedStats[label]},${percentage}%\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `stats_${period}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  // ====== SIMPLIFIED EXPORT SYSTEM ======
  
  // --- EXPORT MODAL FUNCTIONS ---
  function showExportModal() {
    // Set default dates
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const last30Days = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
    
    // Set default dates for all date inputs
    document.getElementById('exportTxStartDate').value = last30Days;
    document.getElementById('exportTxEndDate').value = todayStr;
    document.getElementById('exportAuditStartDate').value = last30Days;
    document.getElementById('exportAuditEndDate').value = todayStr;
    document.getElementById('exportUsageStartDate').value = todayStr;
    document.getElementById('exportUsageEndDate').value = todayStr;
    
    // Show current stock tab by default
    showExportType('current');
    document.getElementById('exportModal').style.display = 'flex';
  }
  
  function hideExportModal() {
    document.getElementById('exportModal').style.display = 'none';
  }
  
  function showExportType(type) {
    // Hide all options
    document.getElementById('exportCurrentOption').style.display = 'none';
    document.getElementById('exportStockMovementOption').style.display = 'none';
    document.getElementById('exportTransactionOption').style.display = 'none';
    document.getElementById('exportUsageOption').style.display = 'none';
    document.getElementById('exportAuditOption').style.display = 'none';
    
    // Remove active class from all tabs
    document.querySelectorAll('#exportTypeTabs button').forEach(btn => btn.classList.remove('active'));
    
    // Show selected option and activate tab
    if (type === 'current') {
      document.getElementById('exportCurrentOption').style.display = 'block';
      document.getElementById('export-type-current').classList.add('active');
    } else if (type === 'stock-movement') {
      document.getElementById('exportStockMovementOption').style.display = 'block';
      document.getElementById('export-type-stock-movement').classList.add('active');
      // Set default dates to current month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startInput = document.getElementById('exportStockMovementStartDate');
      const endInput = document.getElementById('exportStockMovementEndDate');
      if (startInput && !startInput.value) startInput.value = firstDay.toISOString().split('T')[0];
      if (endInput && !endInput.value) endInput.value = lastDay.toISOString().split('T')[0];
    } else if (type === 'transaction') {
      document.getElementById('exportTransactionOption').style.display = 'block';
      document.getElementById('export-type-transaction').classList.add('active');
    } else if (type === 'usage') {
      document.getElementById('exportUsageOption').style.display = 'block';
      document.getElementById('export-type-usage').classList.add('active');
      // Show/hide custom dates based on selection
      document.getElementById('exportUsagePeriod').addEventListener('change', function() {
        document.getElementById('exportCustomDates').style.display = 
          this.value === 'custom' ? 'block' : 'none';
      });
    } else if (type === 'audit') {
      document.getElementById('exportAuditOption').style.display = 'block';
      document.getElementById('export-type-audit').classList.add('active');
    }
  }
  
  // --- EXPORT CURRENT STOCK ---
  function exportCurrentStockCSV() {
    if (inventory.length === 0) {
      alert("No sticker data available.");
      return;
    }
    
    let csv = "Sticker Label,Sticker Name,Total Stock,Used Stock,Remaining Stock,Stock Status,Cost per Sticker (R),Total Cost (R),Last Used Date,Last Used By,Department\n";
    let totalRemaining = 0;
    let totalCostValue = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    
    inventory.forEach(item => {
      const used = item.totalStock - item.remainingStock;
      const totalCost = (item.totalStock * (item.costPerSticker || 0)).toFixed(2);
      let lastUsedDate = "Never";
      let lastUsedPerson = "N/A";
      let lastUsedDept = "N/A";
      
      // Determine stock status
      let stockStatus = "In Stock";
      if (item.remainingStock === 0) {
        stockStatus = "OUT OF STOCK";
        outOfStockCount++;
      } else if (item.remainingStock <= 5) {
        stockStatus = "LOW STOCK";
        lowStockCount++;
      }
      
      // Get last usage details
      if (item.usage && item.usage.length > 0) {
        const sortedUsage = [...item.usage].sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          if (dateA.getTime() !== dateB.getTime()) return dateB.getTime() - dateA.getTime();
          if (a.time && b.time) return b.time.localeCompare(a.time);
          return b.amount - a.amount;
        });
        lastUsedDate = sortedUsage[0].date;
        lastUsedPerson = sortedUsage[0].person;
        lastUsedDept = sortedUsage[0].department || "N/A";
      }
      
      csv += `"${item.label || 'N/A'}","${item.name || 'N/A'}","${item.totalStock}","${used}","${item.remainingStock}","${stockStatus}","${item.costPerSticker ? item.costPerSticker.toFixed(2) : '0.00'}","${totalCost}","${lastUsedDate}","${lastUsedPerson}","${lastUsedDept}"\n`;
      
      totalRemaining += item.remainingStock;
      totalCostValue += parseFloat(totalCost);
    });
    
    // Add summary section
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0] + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    csv += `\nSUMMARY REPORT\n`;
    csv += `Total Sticker Types,${inventory.length}\n`;
    csv += `Total Remaining Stock,${totalRemaining}\n`;
    csv += `Total Inventory Value,R${totalCostValue.toFixed(2)}\n`;
    csv += `Out of Stock Items,${outOfStockCount}\n`;
    csv += `Low Stock Items (≤5),${lowStockCount}\n`;
    csv += `In Stock Items,${inventory.length - outOfStockCount - lowStockCount}\n`;
    csv += `Report Generated,${timestamp}\n`;
    
    // Create and download the file
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sticker_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    hideExportModal();
  }
  
  // --- EXPORT TRANSACTION HISTORY ---
  function exportTransactionHistoryCSV() {
    const startDateStr = document.getElementById('exportTxStartDate').value;
    const endDateStr = document.getElementById('exportTxEndDate').value;
    
    if (!startDateStr || !endDateStr) {
      alert("Please select both start and end dates.");
      return;
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);
    
    const allTx = getAllTransactions();
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate < endDate;
    });
    
    if (filteredTx.length === 0) {
      alert("No transactions found in selected period.");
      return;
    }
    
    let csv = "Date,Time,Sticker,Type,Amount,Balance,Person,Invoice,Department\n";
    filteredTx.forEach(tx => {
      csv += `"${tx.date}","${tx.time}","${tx.sticker}","${tx.type.toUpperCase()}","${tx.amount}","${tx.balance}","${tx.person}","${tx.invoice}","${tx.department}"\n`;
    });
    
    // Add summary
    const added = filteredTx.filter(t => t.type === 'add').reduce((sum, t) => sum + t.amount, 0);
    const deducted = filteredTx.filter(t => t.type === 'deduct').reduce((sum, t) => sum + t.amount, 0);
    
    // Calculate RAND values for Added and Deducted
    let addedRandValue = 0;
    let deductedRandValue = 0;
    filteredTx.forEach(tx => {
      const item = inventory.find(i => (i.label || i.name) === tx.sticker);
      const costPer = item ? item.costPerSticker || 0 : 0;
      if (tx.type === 'add') {
        addedRandValue += tx.amount * costPer;
      } else if (tx.type === 'deduct') {
        deductedRandValue += tx.amount * costPer;
      }
    });
    
    csv += `\nSUMMARY\n`;
    csv += `Total Transactions,${filteredTx.length}\n`;
    csv += `Total Added (Quantity),${added}\n`;
    csv += `Total Added (RAND),R${addedRandValue.toFixed(2)}\n`;
    csv += `Total Deducted (Quantity),${deducted}\n`;
    csv += `Total Deducted (RAND),R${deductedRandValue.toFixed(2)}\n`;
    csv += `Net Change (Quantity),${added - deducted}\n`;
    csv += `Net Change (RAND),R${(addedRandValue - deductedRandValue).toFixed(2)}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_${startDateStr}_to_${endDateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    hideExportModal();
  }
  
  function exportTransactionHistoryPDF() {
    const startDateStr = document.getElementById('exportTxStartDate').value;
    const endDateStr = document.getElementById('exportTxEndDate').value;
    
    if (!startDateStr || !endDateStr) {
      alert("Please select both start and end dates.");
      return;
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);
    
    const allTx = getAllTransactions();
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate < endDate;
    });
    
    if (filteredTx.length === 0) {
      alert("No transactions found in selected period.");
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Transaction History Report`, 14, 15);
    doc.setFontSize(12);
    doc.text(`Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`, 14, 25);
    
    const rows = filteredTx.map(tx => [
      tx.date,
      tx.time,
      tx.sticker,
      tx.type.toUpperCase(),
      tx.amount.toString(),
      tx.balance.toString(),
      tx.person,
      tx.invoice,
      tx.department
    ]);
    
    doc.autoTable({
      head: [["Date", "Time", "Sticker", "Type", "Amount", "Balance", "Person", "Invoice", "Dept"]],
      body: rows,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [27, 79, 114], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    doc.save(`transactions_${startDateStr}_to_${endDateStr}.pdf`);
    hideExportModal();
  }
  
  // --- EXPORT USAGE SUMMARY ---
  function exportUsageSummaryCSV() {
    const period = document.getElementById('exportUsagePeriod').value;
    let startDate, endDate;
    const now = new Date();
    
    if (period === 'custom') {
      const startDateStr = document.getElementById('exportUsageStartDate').value;
      const endDateStr = document.getElementById('exportUsageEndDate').value;
      
      if (!startDateStr || !endDateStr) {
        alert("Please select both start and end dates for custom period.");
        return;
      }
      
      startDate = new Date(startDateStr);
      endDate = new Date(endDateStr);
      endDate.setDate(endDate.getDate() + 1);
    } else {
      if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (period === 'week') {
        const day = now.getDay() || 7;
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      } else if (period === 'last-month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'all') {
        startDate = new Date(2000, 0, 1);
        endDate = new Date(now.getFullYear() + 10, 0, 1);
      }
    }
    
    // Build label-level data with opening stock, added, deducted, closing stock and rand values
    const labelData = {};
    const deptUsage = {};
    
    inventory.forEach(item => {
      const label = item.label || item.name;
      const costPerSticker = item.costPerSticker || 0;
      const allTx = item.transactions || [];
      
      // Calculate opening stock = balance after the last transaction BEFORE the start date
      const txBeforePeriod = allTx.filter(tx => new Date(tx.date) < startDate);
      let openingStock = 0;
      if (txBeforePeriod.length > 0) {
        txBeforePeriod.sort((a, b) => {
          const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
          const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
          return dateB - dateA;
        });
        openingStock = txBeforePeriod[0].balance;
      }
      
      // Calculate total used (deducted) in the period
      let totalUsed = 0;
      item.usage.forEach(u => {
        let usageDate = new Date(u.date);
        usageDate.setHours(0, 0, 0, 0);
        if (usageDate >= startDate && usageDate < endDate) {
          totalUsed += u.amount;
          
          // Department usage with rand value
          const dept = u.department || 'Unknown';
          if (!deptUsage[dept]) deptUsage[dept] = { used: 0, cost: 0 };
          deptUsage[dept].used += u.amount;
          deptUsage[dept].cost += u.amount * costPerSticker;
        }
      });
      
      // Get all transactions in the period to calculate added and deducted
      const itemTransactions = allTx.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= startDate && txDate < endDate;
      });
      
      let totalAdded = 0;
      let totalDeducted = 0;
      itemTransactions.forEach(tx => {
        if (tx.type === 'add') {
          totalAdded += tx.amount;
        } else if (tx.type === 'deduct') {
          totalDeducted += tx.amount;
        }
      });
      
      // Calculate closing stock
      let closingStock = openingStock + totalAdded - totalDeducted;
      closingStock = Math.max(0, closingStock);
      
      // Calculate rand values
      const openingValue = openingStock * costPerSticker;
      const addedValue = totalAdded * costPerSticker;
      const deductedValue = totalDeducted * costPerSticker;
      const closingValue = closingStock * costPerSticker;
      
      // Accumulate label data (multiple items can have the same label)
      if (!labelData[label]) {
        labelData[label] = { openingStock: 0, openingValue: 0, totalAdded: 0, addedValue: 0, totalDeducted: 0, deductedValue: 0, closingStock: 0, closingValue: 0 };
      }
      labelData[label].openingStock += openingStock;
      labelData[label].openingValue += openingValue;
      labelData[label].totalAdded += totalAdded;
      labelData[label].addedValue += addedValue;
      labelData[label].totalDeducted += totalDeducted;
      labelData[label].deductedValue += deductedValue;
      labelData[label].closingStock += closingStock;
      labelData[label].closingValue += closingValue;
    });
    
    // Calculate grand totals
    let gOpeningStock = 0, gOpeningValue = 0;
    let gAdded = 0, gAddedValue = 0;
    let gDeducted = 0, gDeductedValue = 0;
    let gClosingStock = 0, gClosingValue = 0;
    Object.keys(labelData).forEach(label => {
      const d = labelData[label];
      gOpeningStock += d.openingStock;
      gOpeningValue += d.openingValue;
      gAdded += d.totalAdded;
      gAddedValue += d.addedValue;
      gDeducted += d.totalDeducted;
      gDeductedValue += d.deductedValue;
      gClosingStock += d.closingStock;
      gClosingValue += d.closingValue;
    });
    
    if (gDeducted === 0 && gAdded === 0 && gOpeningStock === 0) {
      alert("No data found for the selected period.");
      return;
    }
    
    const periodLabel = period === 'custom' 
      ? `${startDate.toLocaleDateString()} to ${new Date(endDate.getTime() - 86400000).toLocaleDateString()}` 
      : period;
    
    let csv = "USAGE SUMMARY REPORT\n";
    csv += `Period:,${periodLabel}\n`;
    csv += `Generated:,${new Date().toLocaleString()}\n\n`;
    
    // ---- STOCK MOVEMENT SUMMARY ----
    // Header row with clear column grouping
    csv += "STOCK MOVEMENT SUMMARY\n";
    csv += "Label,Opening Stock,Opening Rand Value,Added,Added Rand Value,Deducted (Used),Deducted Rand Value,Closing Stock,Closing Rand Value\n";
    
    Object.keys(labelData).sort().forEach(label => {
      const d = labelData[label];
      csv += `"${label}",${d.openingStock},R${d.openingValue.toFixed(2)},${d.totalAdded},R${d.addedValue.toFixed(2)},${d.totalDeducted},R${d.deductedValue.toFixed(2)},${d.closingStock},R${d.closingValue.toFixed(2)}\n`;
    });
    
    // Grand totals row
    csv += `"TOTALS",${gOpeningStock},R${gOpeningValue.toFixed(2)},${gAdded},R${gAddedValue.toFixed(2)},${gDeducted},R${gDeductedValue.toFixed(2)},${gClosingStock},R${gClosingValue.toFixed(2)}\n`;
    
    // ---- VARIANCE ANALYSIS ----
    csv += "\n\nVARIANCE ANALYSIS\n";
    csv += "Label,Opening Stock,Added,Deducted,Net Change,Closing Stock,Variance Check\n";
    Object.keys(labelData).sort().forEach(label => {
      const d = labelData[label];
      const netChange = d.totalAdded - d.totalDeducted;
      const expectedClosing = d.openingStock + netChange;
      const varianceOk = expectedClosing === d.closingStock ? "OK" : "CHECK";
      csv += `"${label}",${d.openingStock},${d.totalAdded},${d.totalDeducted},${netChange},${d.closingStock},${varianceOk}\n`;
    });
    
    const gNetChange = gAdded - gDeducted;
    const gExpectedClosing = gOpeningStock + gNetChange;
    const gVarianceOk = gExpectedClosing === gClosingStock ? "OK" : "CHECK";
    csv += `"TOTALS",${gOpeningStock},${gAdded},${gDeducted},${gNetChange},${gClosingStock},${gVarianceOk}\n`;
    
    // ---- DEPARTMENT USAGE ----
    csv += "\n\nDEPARTMENT USAGE\n";
    csv += "Department,Total Used,Rand Value\n";
    let gDeptUsed = 0, gDeptCost = 0;
    Object.keys(deptUsage).sort((a, b) => deptUsage[b].used - deptUsage[a].used).forEach(dept => {
      const d = deptUsage[dept];
      csv += `"${dept.charAt(0).toUpperCase() + dept.slice(1)}",${d.used},R${d.cost.toFixed(2)}\n`;
      gDeptUsed += d.used;
      gDeptCost += d.cost;
    });
    csv += `"TOTALS",${gDeptUsed},R${gDeptCost.toFixed(2)}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `usage_summary_${period}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    hideExportModal();
  }
  
  // --- EXPORT PER ITEM STOCK MOVEMENT ---
  function exportPerItemStockMovementCSV() {
    const startDateStr = document.getElementById('exportStockMovementStartDate').value;
    const endDateStr = document.getElementById('exportStockMovementEndDate').value;
    
    if (!startDateStr || !endDateStr) {
      alert("Please select both start date and end date for this export.");
      return;
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);
    
    let csv = "PER ITEM STOCK MOVEMENT REPORT\n";
    csv += `Date Range: ${startDate.toLocaleDateString()} to ${new Date(endDate.getTime() - 86400000).toLocaleDateString()}\n\n`;
    
    // Track total RAND values
    let grandTotalAdded = 0;
    let grandTotalDeducted = 0;
    let grandTotalOpeningStock = 0;
    let grandTotalClosingStock = 0;
    let grandTotalOpeningValue = 0;
    let grandTotalClosingValue = 0;
    let grandTotalAddedValue = 0;
    let grandTotalDeductedValue = 0;
    
    inventory.forEach(item => {
      const label = item.label || item.name;
      const costPerSticker = item.costPerSticker || 0;
      const allTx = item.transactions || [];
      
      // Calculate opening stock = balance after the last transaction BEFORE the start date
      // If no transactions before start date, opening stock = 0
      const txBeforePeriod = allTx.filter(tx => new Date(tx.date) < startDate);
      let openingStock = 0;
      if (txBeforePeriod.length > 0) {
        // Sort by date/time and pick the latest balance
        txBeforePeriod.sort((a, b) => {
          const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
          const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
          return dateB - dateA;
        });
        openingStock = txBeforePeriod[0].balance;
      }
      
      // Get all transactions for this item in the period
      const itemTransactions = allTx.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= startDate && txDate < endDate;
      }).sort((a, b) => {
        const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
        const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
        return dateA - dateB;
      });
      
      // Calculate closing stock after all transactions in the period
      let closingStock = openingStock;
      itemTransactions.forEach(tx => {
        if (tx.type === 'add') {
          closingStock += tx.amount;
        } else if (tx.type === 'deduct') {
          closingStock -= tx.amount;
        }
      });
      closingStock = Math.max(0, closingStock);
      
      // Calculate RAND values
      const openingValue = openingStock * costPerSticker;
      const added = itemTransactions.filter(t => t.type === 'add').reduce((sum, t) => sum + t.amount, 0);
      const deducted = itemTransactions.filter(t => t.type === 'deduct').reduce((sum, t) => sum + t.amount, 0);
      const closingValue = closingStock * costPerSticker;
      const addedValue = added * costPerSticker;
      const deductedValue = deducted * costPerSticker;
      
      // Add section header for this item
      csv += `\n========================================\n`;
      csv += `STICKER: ${label}\n`;
      csv += `Cost per Sticker: R${costPerSticker.toFixed(2)}\n`;
      csv += `========================================\n\n`;
      
      // Opening Stock
      csv += `OPENING STOCK FOR THE MONTH\n`;
      csv += `Opening Stock Quantity,${openingStock}\n`;
      csv += `Opening Stock Value (RAND),R${openingValue.toFixed(2)}\n\n`;
      
      // Transactions
      csv += `TRANSACTIONS FOR THE MONTH\n`;
      csv += `Date,Time,Type,Amount,Balance After,Person,Invoice,Department,Value (RAND)\n`;
      
      if (itemTransactions.length > 0) {
        let currentBalance = openingStock;
        itemTransactions.forEach(tx => {
          if (tx.type === 'add') {
            currentBalance += tx.amount;
            const addedRand = tx.amount * costPerSticker;
            csv += `"${tx.date}","${tx.time}","ADDED","${tx.amount}",${currentBalance},"${tx.person}","${tx.invoice || ''}","${tx.department || ''}",R${addedRand.toFixed(2)}\n`;
          } else {
            currentBalance -= tx.amount;
            const deductedRand = tx.amount * costPerSticker;
            csv += `"${tx.date}","${tx.time}","DEDUCTED","${tx.amount}",${currentBalance},"${tx.person}","${tx.invoice || ''}","${tx.department || ''}",R${deductedRand.toFixed(2)}\n`;
          }
        });
      } else {
        csv += `No transactions recorded for this period\n`;
      }
      
      csv += `\n`;
      
      // Closing Stock
      csv += `CLOSING STOCK FOR THE MONTH\n`;
      csv += `Closing Stock Quantity,${closingStock}\n`;
      csv += `Closing Stock Value (RAND),R${closingValue.toFixed(2)}\n`;
      
      csv += `\n`;
      
      // Summary for this item
      csv += `SUMMARY FOR THIS ITEM\n`;
      csv += `Total Added (Quantity),${added}\n`;
      csv += `Total Added (RAND),R${addedValue.toFixed(2)}\n`;
      csv += `Total Deducted (Quantity),${deducted}\n`;
      csv += `Total Deducted (RAND),R${deductedValue.toFixed(2)}\n`;
      csv += `Net Change,${added - deducted}\n`;
      
      csv += `\n`;
      
      // Accumulate grand totals
      grandTotalOpeningStock += openingStock;
      grandTotalClosingStock += closingStock;
      grandTotalOpeningValue += openingValue;
      grandTotalClosingValue += closingValue;
      grandTotalAdded += added;
      grandTotalAddedValue += addedValue;
      grandTotalDeducted += deducted;
      grandTotalDeductedValue += deductedValue;
    });
    
    // Add grand totals summary
    csv += `\n\n========================================\n`;
    csv += `GRAND TOTALS FOR ALL ITEMS\n`;
    csv += `========================================\n`;
    csv += `Total Opening Stock,${grandTotalOpeningStock}\n`;
    csv += `Total Opening Stock Value (RAND),R${grandTotalOpeningValue.toFixed(2)}\n`;
    csv += `Total Added (Quantity),${grandTotalAdded}\n`;
    csv += `Total Added (RAND),R${grandTotalAddedValue.toFixed(2)}\n`;
    csv += `Total Deducted (Quantity),${grandTotalDeducted}\n`;
    csv += `Total Deducted (RAND),R${grandTotalDeductedValue.toFixed(2)}\n`;
    csv += `Total Closing Stock,${grandTotalClosingStock}\n`;
    csv += `Total Closing Stock Value (RAND),R${grandTotalClosingValue.toFixed(2)}\n`;
    csv += `========================================\n`;
    csv += `Report Generated,${new Date().toLocaleString()}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `stock_movement_${startDateStr}_to_${endDateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    hideExportModal();
  }
  
  // --- EXPORT DETAILED AUDIT ---
  function exportDetailedAuditCSV() {
    const startDateStr = document.getElementById('exportAuditStartDate').value;
    const endDateStr = document.getElementById('exportAuditEndDate').value;
    
    if (!startDateStr || !endDateStr) {
      alert("Please select both start and end dates.");
      return;
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);
    
    const allTx = getAllTransactions();
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate < endDate;
    });
    
    if (filteredTx.length === 0) {
      alert("No transactions found in selected period.");
      return;
    }
    
    let csv = "Detailed Audit Report\n";
    csv += `Period: ${startDate.toLocaleDateString()} to ${new Date(endDate.getTime() - 86400000).toLocaleDateString()}\n\n`;
    
    csv += "Date,Time,Sticker Label,Transaction Type,Amount,Balance After,Person Responsible,Invoice Number,Department,Cost per Sticker (R),Added Cost (R),Deducted Cost (R)\n";
    
    let totalAdded = 0;
    let totalDeducted = 0;
    let totalCost = 0;
    let totalDeductedCost = 0;
    
    filteredTx.forEach(tx => {
      const item = inventory.find(i => (i.label || i.name) === tx.sticker);
      const costPer = item ? item.costPerSticker || 0 : 0;
      const txCost = tx.type === 'add' ? tx.amount * costPer : 0;
      const deductedCost = tx.type === 'deduct' ? tx.amount * costPer : 0;
      
      csv += `"${tx.date}","${tx.time}","${tx.sticker}","${tx.type.toUpperCase()}","${tx.amount}","${tx.balance}","${tx.person}","${tx.invoice}","${tx.department}","${costPer.toFixed(2)}","${txCost.toFixed(2)}","${deductedCost.toFixed(2)}"\n`;
      
      if (tx.type === 'add') {
        totalAdded += tx.amount;
        totalCost += txCost;
      } else {
        totalDeducted += tx.amount;
        totalDeductedCost += deductedCost;
      }
    });
    
    csv += `\nSUMMARY\n`;
    csv += `Total Transactions,${filteredTx.length}\n`;
    csv += `Total Stock Added (Quantity),${totalAdded}\n`;
    csv += `Total Stock Added (RAND),R${totalCost.toFixed(2)}\n`;
    csv += `Total Stock Deducted (Quantity),${totalDeducted}\n`;
    csv += `Total Stock Deducted (RAND),R${totalDeductedCost.toFixed(2)}\n`;
    csv += `Net Stock Change (Quantity),${totalAdded - totalDeducted}\n`;
    csv += `Net Stock Change (RAND),R${(totalCost - totalDeductedCost).toFixed(2)}\n`;
    csv += `Report Generated,${new Date().toLocaleString()}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_report_${startDateStr}_to_${endDateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    hideExportModal();
  }
  
  function exportDetailedAuditPDF() {
    const startDateStr = document.getElementById('exportAuditStartDate').value;
    const endDateStr = document.getElementById('exportAuditEndDate').value;
    
    if (!startDateStr || !endDateStr) {
      alert("Please select both start and end dates.");
      return;
    }
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);
    
    const allTx = getAllTransactions();
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate < endDate;
    });
    
    if (filteredTx.length === 0) {
      alert("No transactions found in selected period.");
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Detailed Audit Report`, 14, 15);
    doc.setFontSize(12);
    doc.text(`Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`, 14, 25);
    
    let totalAdded = 0;
    let totalDeducted = 0;
    let totalCost = 0;
    
    const rows = filteredTx.map(tx => {
      const item = inventory.find(i => (i.label || i.name) === tx.sticker);
      const costPer = item ? item.costPerSticker || 0 : 0;
      const txCost = tx.type === 'add' ? tx.amount * costPer : 0;
      
      if (tx.type === 'add') {
        totalAdded += tx.amount;
        totalCost += txCost;
      } else {
        totalDeducted += tx.amount;
      }
      
      return [
        tx.date,
        tx.time,
        tx.sticker,
        tx.type.toUpperCase(),
        tx.amount.toString(),
        tx.balance.toString(),
        tx.person,
        tx.invoice,
        tx.department,
        "R" + costPer.toFixed(2),
        "R" + txCost.toFixed(2)
      ];
    });
    
    doc.autoTable({
      head: [["Date", "Time", "Sticker", "Type", "Amount", "Balance", "Person", "Invoice", "Dept", "Cost Each", "Total Cost"]],
      body: rows,
      startY: 35,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [27, 79, 114], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Summary: Added ${totalAdded}, Deducted ${totalDeducted}, Net: ${totalAdded - totalDeducted}`, 14, finalY);
    doc.text(`Total Cost: R${totalCost.toFixed(2)}`, 14, finalY + 5);
    
    doc.save(`audit_report_${startDateStr}_to_${endDateStr}.pdf`);
    hideExportModal();
  }
  
  // --- UTILITY FUNCTIONS ---
  function getAllTransactions() {
    const allTx = [];
    inventory.forEach(item => {
      const label = item.label || item.name || 'Unknown';
      if (Array.isArray(item.transactions)) {
        item.transactions.forEach(tx => {
          allTx.push({
            sticker: label,
            type: tx.type,
            amount: tx.amount,
            balance: tx.balance,
            date: tx.date,
            time: tx.time,
            person: tx.person || 'N/A',
            invoice: tx.invoice || '',
            department: tx.department || ''
          });
        });
      }
    });
    // Sort newest first
    return allTx.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateB - dateA;
    });
  }
  
  function downloadJSON() {
    const dataStr = "text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(inventory, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "sticker_inventory_backup.json");
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    document.body.removeChild(dlAnchor);
  }
  
  function uploadJSON(evt) {
    let file = evt.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
      try {
        let data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if (confirm("⚠️ This will REPLACE ALL current data. Continue?")) {
            inventory = data;
            saveInventory().then(() => {
              updateSelectors();
              updateReport();
              alert("Upload successful!");
            });
          }
        } else { alert("Invalid file format. Please upload a JSON file."); }
      } catch(err) { alert("Invalid file format. Please upload a valid JSON file."); }
    };
    reader.readAsText(file);
    evt.target.value = "";
  }
  
  function resetAllData() {
    if (!confirm("⚠️ DELETE ALL data permanently? This cannot be undone.")) return;
    inventory = [];
    saveInventory().then(() => {
      updateSelectors();
      updateReport();
    });
  }
  
  // === TRANSACTION HISTORY MODAL ===
  function showTransactionHistoryModal() {
    if (userRole !== "admin") return;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const last30Days = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];

    document.getElementById('txStartDate').value = last30Days;
    document.getElementById('txEndDate').value = todayStr;
    renderTransactionHistory();
    document.getElementById('transactionHistoryModal').style.display = 'flex';
  }

  function hideTransactionHistoryModal() {
    document.getElementById('transactionHistoryModal').style.display = 'none';
  }

  function renderTransactionHistory() {
    const startDateStr = document.getElementById('txStartDate').value;
    const endDateStr = document.getElementById('txEndDate').value;

    if (!startDateStr || !endDateStr) {
      alert("Please select both start and end dates.");
      return;
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 1);

    const allTx = getAllTransactions();
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate < endDate;
    });

    let html = '';
    if (filteredTx.length === 0) {
      html = `<p class="text-center" style="font-size: 1.1rem; padding: 25px;">No transactions found in selected period.</p>`;
    } else {
      html = `<table id="transactionTable" style="width:100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Sticker</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Balance</th>
            <th>Person</th>
            <th>Invoice</th>
            <th>Department</th>
          </tr>
        </thead>
        <tbody>`;
      filteredTx.forEach(tx => {
        html += `<tr>
          <td>${tx.date}</td>
          <td>${tx.time}</td>
          <td>${tx.sticker}</td>
          <td style="font-weight: 600; color: ${tx.type === 'add' ? 'var(--accent-secondary)' : 'var(--accent-danger)'};">
            ${tx.type === 'add' ? 'ADD' : 'DEDUCT'}
          </td>
          <td style="font-weight: 500;">${tx.amount}</td>
          <td style="font-weight: 600;">${tx.balance}</td>
          <td>${tx.person}</td>
          <td>${tx.invoice || '—'}</td>
          <td>${tx.department ? tx.department.charAt(0).toUpperCase() + tx.department.slice(1) : '—'}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    document.getElementById('transactionHistoryContent').innerHTML = html;
  }

  // --- FORM VALIDATION ---
  function validateAddSticker() {
    const name = document.getElementById("stickerName").value.trim();
    const label = document.getElementById("stickerLabel").value;
    const stock = parseInt(document.getElementById("initialStock").value);
    const cost = parseFloat(document.getElementById("stickerCost").value);
    document.getElementById("addStickerBtn").disabled = !(name && label && !isNaN(stock) && stock >= 0 && !isNaN(cost) && cost >= 0);
  }
  
  function validateDeduct() {
    const stickerIdx = document.getElementById("selectSticker").value;
    const dep = document.getElementById("department").value;
    const per = document.getElementById("person").value.trim();
    const date = document.getElementById("deductDate").value;
    const amt = parseInt(document.getElementById("deductAmount").value);
    document.getElementById("deductBtn").disabled = !(stickerIdx !== "" && dep && per && date && !isNaN(amt) && amt > 0 && inventory.length > 0);
  }
  
  ["stickerName", "stickerLabel", "initialStock", "stickerCost"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", validateAddSticker);
        el.addEventListener("change", validateAddSticker);
    }
  });
  
  ["selectSticker", "department", "person", "deductDate", "deductAmount"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", validateDeduct);
        el.addEventListener("change", validateDeduct);
    }
  });
  
  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', function() {
    const deductBtn = document.getElementById("deductBtn");
    if (deductBtn) {
        deductBtn.addEventListener("click", function() {
            if (!this.disabled) deductStock();
        });
    }
  });
  
  window.onload = async () => {
    showLoader(true);
    await loadInventory();
    updateSelectors();
    updateReport();
    document.getElementById("deductDate").value = new Date().toISOString().split('T')[0];
    showLoader(false);
    validateAddSticker();
    validateDeduct();
    document.getElementById("loginModal").style.display = "flex";
    document.getElementById("loginPassword").focus();
  };
