// Data Management
const INITIAL_INVENTORY = [
    { id: 1, name: "شاي", stock: 50 },
    { id: 2, name: "قهوة تركي", stock: 30 },
    { id: 3, name: "نسكافيه", stock: 40 },
    { id: 4, name: "عصير برتقال", stock: 20 },
    { id: 5, name: "يانسون", stock: 25 }
];

// Simple State for Cart
let currentCart = [];

function getInventory() {
    const data = localStorage.getItem('inventory');
    return data ? JSON.parse(data) : INITIAL_INVENTORY;
}

function saveInventory(inventory) {
    localStorage.setItem('inventory', JSON.stringify(inventory));
}

function getOrders() {
    const data = localStorage.getItem('orders');
    return data ? JSON.parse(data) : [];
}

function saveOrders(orders) {
    localStorage.setItem('orders', JSON.stringify(orders));
}

// ------------------------------------------------------------------
// CART & ORDER LOGIC (User Side)
// ------------------------------------------------------------------

function addToCart(itemId) {
    const inventory = getInventory();
    const item = inventory.find(i => i.id == itemId);

    if (!item) return;

    // Check if enough stock exists considering what's already in the cart
    const inCartCount = currentCart.filter(c => c.itemId === itemId).length;

    if (item.stock > inCartCount) {
        currentCart.push({
            itemId: item.id,
            name: item.name
        });
        renderCartUI();
    } else {
        alert("عذراً، الكمية المتاحة في المخزن لا تكفي لإضافة المزيد من هذا الصنف");
    }
}

function removeFromCart(index) {
    currentCart.splice(index, 1);
    renderCartUI();
}

function submitOrder(employeeName, note) {
    if (currentCart.length === 0) {
        alert("السلة فارغة!");
        return;
    }

    // Double check stock one last time
    const inventory = getInventory();
    for (const cartItem of currentCart) {
        const stockItem = inventory.find(i => i.id == cartItem.itemId);
        const inCartCount = currentCart.filter(c => c.itemId === cartItem.itemId).length;
        if (!stockItem || stockItem.stock < inCartCount) {
            alert(`عذراً، الكمية المطلوبة من ${cartItem.name} غير متوفرة حالياً.`);
            return;
        }
    }

    const orders = getOrders();
    const newOrder = {
        id: Date.now(),
        employeeName: employeeName,
        items: [...currentCart], // copy cart
        note: note,
        status: 'pending',
        date: new Date().toISOString()
    };

    orders.push(newOrder);
    saveOrders(orders);

    // Clear cart
    currentCart = [];
    renderCartUI();
    renderUserOrders(); // Refresh history
    alert("تم إرسال طلبك بنجاح!");
}


// ------------------------------------------------------------------
// ADMIN ACTIONS
// ------------------------------------------------------------------

function getAdminName() {
    const name = localStorage.getItem('admin_name');
    return name ? name : 'غير معروف';
}

function approveOrder(orderId) {
    let orders = getOrders();
    let inventory = getInventory();

    const orderIndex = orders.findIndex(o => o.id == orderId);
    if (orderIndex === -1) return;

    const order = orders[orderIndex];

    // Check availability for ALL items first
    const itemsToDeduct = {};
    order.items.forEach(item => {
        itemsToDeduct[item.itemId] = (itemsToDeduct[item.itemId] || 0) + 1;
    });

    // Validation loop
    for (const [itemId, qty] of Object.entries(itemsToDeduct)) {
        const inventoryItem = inventory.find(i => i.id == itemId);
        if (!inventoryItem || inventoryItem.stock < qty) {
            alert(`لا يمكن الموافقة: الكمية غير كافية للصنف (ID: ${itemId})`);
            return; // Abort whole transaction
        }
    }

    // Deduct loop
    for (const [itemId, qty] of Object.entries(itemsToDeduct)) {
        const inventoryItem = inventory.find(i => i.id == itemId);
        inventoryItem.stock -= qty;
    }

    order.status = 'approved';
    order.processedDate = new Date().toISOString();
    order.processedBy = getAdminName();

    saveInventory(inventory);
    saveOrders(orders);

    renderAdminDashboard();
}

function rejectOrder(orderId) {
    let orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id == orderId);
    if (orderIndex !== -1) {
        orders[orderIndex].status = 'rejected';
        orders[orderIndex].processedDate = new Date().toISOString();
        orders[orderIndex].processedBy = getAdminName();
        saveOrders(orders);
        renderAdminDashboard();
    }
}

function addStock(itemId, quantity) {
    let inventory = getInventory();
    const item = inventory.find(i => i.id == itemId);
    if (item) {
        item.stock += parseInt(quantity);
        saveInventory(inventory);
        alert(`تم إضافة ${quantity} إلى ${item.name}`);
        renderAdminDashboard();
    }
}

function addNewProductInternal(name, stock) {
    let inventory = getInventory();
    const newProduct = {
        id: Date.now(), // Unique ID
        name: name,
        stock: parseInt(stock)
    };
    inventory.push(newProduct);
    saveInventory(inventory);
    alert('تم إضافة المنتج بنجاح');
    renderAdminDashboard();
}

function deleteProductInternal(itemId) {
    let inventory = getInventory();
    const updatedInventory = inventory.filter(i => i.id !== itemId);
    saveInventory(updatedInventory);
    alert('تم حذف المنتج بنجاح');
    renderAdminDashboard();
}

// ------------------------------------------------------------------
// UI RENDERING & HANDLERS
// ------------------------------------------------------------------

// --- USER SIDE ---

function renderMenu() {
    const container = document.getElementById('menu-container');
    if (!container) return;

    const inventory = getInventory();
    container.innerHTML = inventory.map(item => `
        <div class="card">
            <h3>${item.name}</h3>
            <div class="stock-badge ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}">
                ${item.stock > 0 ? `متوفر: ${item.stock}` : 'غير متوفر'}
            </div>
            <button class="btn" style="width:100%; margin-top:10px" 
                onclick="addToCart(${item.id})" 
                ${item.stock <= 0 ? 'disabled style="background:grey; cursor:not-allowed"' : ''}>
                ${item.stock > 0 ? 'إضافة للسلة +' : 'نفذت الكمية'}
            </button>
        </div>
    `).join('');
}

function renderCartUI() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total');

    if (!container) return;

    if (currentCart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#777;">السلة فارغة</p>';
        if (totalEl) totalEl.textContent = '0';
        return;
    }

    container.innerHTML = currentCart.map((item, index) => `
        <div class="cart-item">
            <span>${item.name}</span>
            <button onclick="removeFromCart(${index})" class="btn-danger btn-sm">حذف</button>
        </div>
    `).join('');

    if (totalEl) totalEl.innerHTML = `(${currentCart.length}) عنصر`;
}

function renderUserOrders() {
    const lastUser = localStorage.getItem('last_user_name');
    if (!lastUser) return;

    const orders = getOrders().filter(o => o.employeeName === lastUser).reverse();
    const container = document.getElementById('user-orders-container');

    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = '<p>لا توجد طلبات سابقة لهذا الاسم.</p>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-status-card status-${order.status}">
            <div style="display:flex; justify-content:space-between">
                <strong>طلب #${order.id.toString().slice(-4)}</strong>
                <span style="font-size:0.9rem">${new Date(order.date).toLocaleString('ar-EG')}</span>
            </div>
            <p>
                ${order.items.map(i => i.name).join(' + ')} 
                ${order.items.length > 1 ? `(${order.items.length} أصناف)` : ''}
            </p>
            ${order.note ? `<p style="color:#666; font-size:0.9rem">📝 ملاحظة: ${order.note}</p>` : ''}
            <div style="margin-top:5px; font-weight:bold">
                الحالة: 
                ${order.status === 'pending' ? 'قيد الانتظار ⏳' :
            order.status === 'approved' ? 'تمت الموافقة ✅' : 'مرفوض ❌'}
            </div>
        </div>
    `).join('');
}


// --- ADMIN SIDE ---

function renderAdminDashboard() {
    renderAdminOrders();
    renderInventory();
    renderReports();
}

function renderAdminOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    const orders = getOrders().sort((a, b) => new Date(b.date) - new Date(a.date));

    // Filter pending for top section? Or all? Let's show All but prioritize Pending visually
    const pendingOrders = orders.filter(o => o.status === 'pending');

    if (pendingOrders.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">لا توجد طلبات جديدة قيد الانتظار.</p>';
    } else {
        let html = `
        <table>
            <thead>
                <tr>
                    <th>رقم الطلب</th>
                    <th>الموظف</th>
                    <th>التفاصيل</th>
                    <th>ملاحظات</th>
                    <th>الوقت</th>
                    <th>إجراءات</th>
                </tr>
            </thead>
            <tbody>`;

        html += pendingOrders.map(order => `
            <tr>
                <td>#${order.id.toString().slice(-4)}</td>
                <td>${order.employeeName}</td>
                <td>
                    ${order.items.map(i => `<div>- ${i.name}</div>`).join('')}
                    <strong>العدد: ${order.items.length}</strong>
                </td>
                <td>${order.note || '-'}</td>
                <td>${new Date(order.date).toLocaleTimeString('ar-EG')}</td>
                <td>
                    <button class="btn btn-success" onclick="handleApprove(${order.id})">موافقة</button>
                    <button class="btn btn-danger" onclick="handleReject(${order.id})">رفض</button>
                </td>
            </tr>
        `).join('');

        html += `</tbody></table>`;
        container.innerHTML = html;
    }
}

function renderInventory() {
    const container = document.getElementById('inventory-container');
    if (!container) return;

    const inventory = getInventory();

    let html = `
    <table>
        <thead>
            <tr>
                <th>الصنف</th>
                <th>المخزون الحالي</th>
                <th>إجراءات</th>
            </tr>
        </thead>
        <tbody>`;

    html += inventory.map(item => `
        <tr>
            <td>${item.name}</td>
            <td><strong>${item.stock}</strong></td>
            <td>
                <div style="display:flex; gap:5px; justify-content:center; align-items:center;">
                    <input type="number" id="stock-input-${item.id}" placeholder="إضافة" style="width:60px; padding:5px">
                    <button class="btn btn-sm" onclick="handleAddStock(${item.id})">+</button>
                    <button class="btn btn-danger btn-sm" onclick="handleDeleteProduct(${item.id})">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderReports() {
    const container = document.getElementById('reports-container');
    const statsContainer = document.getElementById('stats-summary');
    if (!container) return;

    const orders = getOrders().filter(o => o.status !== 'pending').sort((a, b) => new Date(b.processedDate) - new Date(a.processedDate));

    // Stats Logic
    const totalOrders = orders.filter(o => o.status === 'approved').length;

    if (statsContainer) {
        statsContainer.innerHTML = `
            <div style="display:flex; gap:20px; font-size:1.2rem; margin:15px 0;">
                <div class="card" style="flex:1;">
                    <h3>الطلبات المكتملة</h3>
                    <p style="color:green; font-weight:bold">${totalOrders}</p>
                </div>
                <div class="card" style="flex:1;">
                    <h3>إجمالي الطلبات (موافق عليه ومرفوض)</h3>
                    <p>${orders.length}</p>
                </div>
            </div>
        `;
    }

    let html = `
    <table>
        <thead>
            <tr>
                <th>رقم الطلب</th>
                <th>الموظف</th>
                <th>التفاصيل</th>
                <th>الحالة</th>
                <th>بواسطة (الأدمن)</th>
                <th>تاريخ المعالجة</th>
            </tr>
        </thead>
        <tbody>`;

    html += orders.map(order => `
        <tr>
            <td>#${order.id.toString().slice(-4)}</td>
            <td>${order.employeeName}</td>
            <td>${order.items.map(i => i.name).join(', ')}</td>
            <td><span class="status-badge ${order.status}">${order.status === 'approved' ? 'موافق' : 'مرفوض'}</span></td>
            <td>${order.processedBy || 'غير محدد'}</td>
            <td>${new Date(order.processedDate).toLocaleString('ar-EG')}</td>
        </tr>
    `).join('');

    html += `</tbody></table>`;

    container.innerHTML = html;
}


// ------------------------------------------------------------------
// GLOBAL EVENT HANDLERS
// ------------------------------------------------------------------

window.handleSubmitOrder = function () {
    const nameInput = document.getElementById('employee-name');
    const noteInput = document.getElementById('order-note');

    const name = nameInput.value.trim();
    if (!name) {
        alert("الرجاء إدخال اسم الموظف");
        return;
    }

    localStorage.setItem('last_user_name', name);
    submitOrder(name, noteInput.value.trim());

    if (currentCart.length === 0) {
        noteInput.value = '';
    }
};

window.handleApprove = function (orderId) {
    const name = localStorage.getItem('admin_name');
    if (!name) {
        alert("الرجاء إدخال اسمك في خانة اسم المسؤول بالأعلى أولاً!");
        document.getElementById('admin-name-input').focus();
        return;
    }
    if (confirm('تأكيد الموافقة وصرف الكميات من المخزون؟')) {
        approveOrder(orderId);
    }
};

window.handleReject = function (orderId) {
    const name = localStorage.getItem('admin_name');
    if (!name) {
        alert("الرجاء إدخال اسمك في خانة اسم المسؤول بالأعلى أولاً!");
        document.getElementById('admin-name-input').focus();
        return;
    }
    if (confirm('رفض الطلب؟')) {
        rejectOrder(orderId);
    }
};

window.handleAddStock = function (itemId) {
    const input = document.getElementById(`stock-input-${itemId}`);
    if (input.value > 0) {
        addStock(itemId, input.value);
        input.value = '';
    }
};

window.addNewProduct = function () {
    const name = document.getElementById('new-prod-name').value;
    const stock = document.getElementById('new-prod-stock').value;

    if (name && stock) {
        addNewProductInternal(name, stock);
        document.getElementById('new-prod-name').value = '';
        document.getElementById('new-prod-stock').value = '';
        document.getElementById('add-product-form').style.display = 'none';
    } else {
        alert('الرجاء تعبئة جميع الحقول');
    }
}

window.handleDeleteProduct = function (id) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج نهائياً من القائمة؟')) {
        deleteProductInternal(id);
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // If on user page
    const nameInput = document.getElementById('employee-name');
    if (nameInput) {
        const lastUser = localStorage.getItem('last_user_name');
        if (lastUser) {
            nameInput.value = lastUser;
        }
    }
});
