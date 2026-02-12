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
// USER MANAGEMENT (New)
// ------------------------------------------------------------------

const DEFAULT_SUPER_ADMIN = {
    username: 'hitler',
    password: '1122',
    role: 'super_admin',
    createdAt: new Date().toISOString()
};

function getUsers() {
    const data = localStorage.getItem('app_users');
    let users = data ? JSON.parse(data) : [];

    // Check if Super Admin exists, if so update credentials (to allow code changes to take effect)
    const superAdminIndex = users.findIndex(u => u.username === DEFAULT_SUPER_ADMIN.username);

    if (superAdminIndex !== -1) {
        // Update existing super admin
        users[superAdminIndex] = { ...users[superAdminIndex], ...DEFAULT_SUPER_ADMIN };
        saveUsers(users); // Save the update
    } else {
        // Create if not exists
        users.push(DEFAULT_SUPER_ADMIN);
        saveUsers(users);
    }

    return users;
}

function saveUsers(users) {
    localStorage.setItem('app_users', JSON.stringify(users));
}

function createUser(username, password, role = 'user') {
    let users = getUsers();
    if (users.find(u => u.username === username)) {
        alert('اسم المستخدم هذا موجود بالفعل!');
        return false;
    }
    users.push({ username, password, role, createdAt: new Date().toISOString() });
    saveUsers(users);
    alert('تم إنشاء المستخدم بنجاح');
    renderUserManagement();
    return true;
}

function deleteUser(username) {
    if (username === 'admin') {
        alert('لا يمكن حذف المدير العام (Super Admin)');
        return;
    }
    if (confirm(`هل أنت متأكد من حذف المستخدم ${username}؟`)) {
        let users = getUsers();
        users = users.filter(u => u.username !== username);
        saveUsers(users);
        renderUserManagement();
    }
}

function updateUserRole(username, newRole) {
    if (username === 'admin') {
        alert('لا يمكن تغيير صلاحيات المدير العام');
        return;
    }
    let users = getUsers();
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        users[userIndex].role = newRole;
        saveUsers(users);
        renderUserManagement();
        alert(`تم تغيير صلاحية ${username} إلى ${translateRole(newRole)}`);
    }
}

function verifyUserCredentials(username, password, requiredRole = null) {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) return false;

    if (requiredRole) {
        if (requiredRole === 'admin') {
            return user.role === 'admin' || user.role === 'super_admin';
        }
        return user.role === requiredRole;
    }

    return user; // Return user object if check passes
}

function translateRole(role) {
    if (role === 'super_admin') return 'مدير عام 👑';
    if (role === 'admin') return 'أدمن 🛠️';
    return 'عميل 👤';
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

function decreaseStock(itemId, quantity) {
    let inventory = getInventory();
    const item = inventory.find(i => i.id == itemId);
    if (item) {
        const qty = parseInt(quantity);
        if (qty <= 0) {
            alert('الكمية يجب أن تكون أكبر من صفر');
            return;
        }
        if (item.stock < qty) {
            alert(`الكمية المراد خصمها (${qty}) أكبر من المتوفر (${item.stock})`);
            return;
        }
        item.stock -= qty;
        saveInventory(inventory);
        alert(`تم خصم ${qty} من ${item.name}`);
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

// ------------------------------------------------------------------
// RATING SYSTEM
// ------------------------------------------------------------------

function submitRating(orderId) {
    const ratingVal = document.getElementById(`rate-${orderId}`).value;
    let orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id == orderId);
    if (orderIndex !== -1) {
        orders[orderIndex].rating = parseInt(ratingVal);
        saveOrders(orders);
        alert('شكراً لتقييمك!');
        renderUserOrders(); // Refresh to show stars instead of input
    }
}

window.submitRating = submitRating;

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

    container.innerHTML = orders.map(order => {
        // UI for Admin Name
        const adminInfo = order.processedBy
            ? `<div style="margin-top:5px; font-size:0.85rem; color:#555; background:rgba(0,0,0,0.05); padding:5px; border-radius:4px;">
                👷‍♂️ تم التعامل بواسطة: <strong>${order.processedBy}</strong>
               </div>`
            : '';

        // UI for Rating
        let ratingSection = '';
        if (order.status === 'approved') {
            if (order.rating) {
                // Show stars
                ratingSection = `<div style="margin-top:5px; color:#ffc107; font-size:1.2rem;">
                    ${'★'.repeat(order.rating)}${'☆'.repeat(5 - order.rating)}
                </div>`;
            } else {
                // Show input
                ratingSection = `
                    <div style="margin-top:8px; border-top:1px dashed #ccc; padding-top:8px;">
                        <label style="font-size:0.85rem;">كيف كانت الخدمة؟</label>
                        <div style="display:flex; gap:5px; margin-top:5px;">
                            <select id="rate-${order.id}" style="padding:4px; border-radius:4px; border:1px solid #ddd;">
                                <option value="5">⭐⭐⭐⭐⭐ (ممتاز)</option>
                                <option value="4">⭐⭐⭐⭐ (جيد جداً)</option>
                                <option value="3">⭐⭐⭐ (جيد)</option>
                                <option value="2">⭐⭐ (مقبول)</option>
                                <option value="1">⭐ (سيء)</option>
                            </select>
                            <button onclick="submitRating(${order.id})" class="btn btn-sm" style="background:#28a745; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">تقييم</button>
                        </div>
                    </div>
                `;
            }
        }

        return `
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

            ${adminInfo}
            ${ratingSection}
        </div>
    `}).join('');
}


// --- ADMIN SIDE ---

function renderAdminDashboard() {
    renderAdminOrders();
    renderInventory();
    renderReports();
    renderUserManagement();
}

function renderUserManagement() {
    const container = document.getElementById('users-management-container');
    if (!container) return;

    // Get current logged-in admin username
    const currentAdminName = localStorage.getItem('admin_name');
    const allUsers = getUsers();
    const currentUser = allUsers.find(u => u.username === currentAdminName);

    // Check if current user is Super Admin
    const isSuperAdmin = currentUser && currentUser.role === 'super_admin';

    const users = getUsers();

    let html = `
    <div class="card">
        <h3>إضافة مستخدم جديد</h3>
        <div style="display:flex; gap:10px; align-items:flex-end;">
            <div>
                <label>اسم المستخدم</label>
                <input type="text" id="new-username" placeholder="مثلاً: ahmed">
            </div>
            <div>
                <label>كلمة المرور</label>
                <input type="text" id="new-password" placeholder="******">
            </div>
            ${isSuperAdmin ? `
            <div>
                <label>الصلاحية</label>
                <select id="new-role">
                    <option value="user">عميل (عادي)</option>
                    <option value="admin">أدمن (Admin)</option>
                </select>
            </div>
            ` : ''}
            <button class="btn btn-success" onclick="handleAddUser()">إنشاء مستخدم</button>
        </div>
        ${!isSuperAdmin ? '<p style="color:orange; font-size:0.9rem; margin-top:5px;">⚠️ فقط المدير العام (admin) يمكنه إنشاء أدمن جديد.</p>' : ''}
    </div>
    
    <h3 style="margin-top:20px">قائمة المستخدمين (${users.length})</h3>
    <div class="table-responsive">
    <table>
        <thead>
            <tr>
                <th>اسم المستخدم</th>
                <th>الصلاحية</th>
                <th>كلمة المرور</th>
                <th>تاريخ الإنشاء</th>
                <th>إجراءات</th>
            </tr>
        </thead>
        <tbody>`;

    if (users.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center">لا يوجد مستخدمين مسجلين حالياً</td></tr>`;
    } else {
        html += users.map(user => {
            let actions = '';

            // Delete Action
            if (isSuperAdmin && user.role !== 'super_admin') {
                actions += `<button class="btn btn-danger btn-sm" onclick="deleteUser('${user.username}')">حذف</button> `;
            }

            // Role Toggle Action (Only Super Admin can do this)
            if (isSuperAdmin && user.role !== 'super_admin') {
                if (user.role === 'user') {
                    actions += `<button class="btn btn-sm" style="background:#17a2b8; color:white" onclick="updateUserRole('${user.username}', 'admin')">⬆️ ترقية لأدمن</button>`;
                } else if (user.role === 'admin') {
                    actions += `<button class="btn btn-sm" style="background:#ffc107; color:black" onclick="updateUserRole('${user.username}', 'user')">⬇️ خفض لعميل</button>`;
                }
            }

            return `
            <tr>
                <td>${user.username} ${user.username === currentAdminName ? '(أنت)' : ''}</td>
                <td><span class="status-badge" style="background:${user.role === 'super_admin' ? '#purple' : user.role === 'admin' ? '#007bff' : '#6c757d'}">${translateRole(user.role || 'user')}</span></td>
                <td>${user.password}</td>
                <td>${new Date(user.createdAt).toLocaleDateString('ar-EG')}</td>
                <td>
                    <div style="display:flex; gap:5px; justify-content:center;">
                        ${actions}
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
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
        <div class="table-responsive">
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
                    <div style="display:flex; gap:5px; flex-wrap:wrap">
                        <button class="btn btn-success btn-sm" onclick="handleApprove(${order.id})">موافقة</button>
                        <button class="btn btn-danger btn-sm" onclick="handleReject(${order.id})">رفض</button>
                    </div>
                </td>
            </tr>
        `).join('');

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }
}

function renderInventory() {
    const container = document.getElementById('inventory-container');
    if (!container) return;

    const inventory = getInventory();

    let html = `
    <div class="table-responsive">
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
                    <input type="number" id="stock-input-${item.id}" placeholder="الكمية" style="width:60px; padding:5px">
                    <button class="btn btn-sm" onclick="handleAddStock(${item.id})">+</button>
                    <button class="btn btn-sm" style="background:#ffc107; color:black" onclick="handleDecreaseStock(${item.id})">-</button>
                    <button class="btn btn-danger btn-sm" onclick="handleDeleteProduct(${item.id})">حذف</button>
                </div>
            </td>
        </tr>
    `).join('');

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderReports() {
    const container = document.getElementById('reports-container');
    const statsContainer = document.getElementById('stats-summary');
    if (!container) return;

    const orders = getOrders().filter(o => o.status !== 'pending').sort((a, b) => new Date(b.processedDate) - new Date(a.processedDate));

    // Stats Logic
    const totalOrders = orders.filter(o => o.status === 'approved').length;

    // --- Admin Ratings Logic (New) ---
    const adminStats = {};
    orders.forEach(o => {
        if (o.processedBy && o.rating) {
            if (!adminStats[o.processedBy]) {
                adminStats[o.processedBy] = { totalRating: 0, count: 0 };
            }
            adminStats[o.processedBy].totalRating += o.rating;
            adminStats[o.processedBy].count += 1;
        }
    });

    if (statsContainer) {
        // Build Rating Report HTML
        let ratingHtml = `
            <div class="card" style="margin-top:20px; border-right: 4px solid #ffc107;">
                <h3>🌟 تقييمات الأداء (للمسؤولين)</h3>
                <div class="table-responsive">
                <table style="width:100%; margin-top:10px;">
                    <thead>
                        <tr>
                            <th style="padding:8px; border-bottom:1px solid #ddd;">اسم المسؤول</th>
                            <th style="padding:8px; border-bottom:1px solid #ddd;">عدد التقييمات</th>
                            <th style="padding:8px; border-bottom:1px solid #ddd;">متوسط التقييم</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const hasRatings = Object.keys(adminStats).length > 0;

        if (!hasRatings) {
            ratingHtml += `<tr><td colspan="3" style="text-align:center; padding:10px; color:#777;">لا توجد تقييمات مسجلة بعد</td></tr>`;
        } else {
            for (const [name, stats] of Object.entries(adminStats)) {
                const avg = (stats.totalRating / stats.count).toFixed(1);
                ratingHtml += `
                    <tr>
                        <td style="padding:8px;">${name}</td>
                        <td style="padding:8px;">${stats.count}</td>
                        <td style="padding:8px;"><strong>${avg}</strong> / 5.0 ⭐</td>
                    </tr>
                `;
            }
        }
        ratingHtml += `</tbody></table></div></div>`;


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
            ${ratingHtml}
        `;
    }

    let html = `
    <div class="table-responsive">
    <table>
        <thead>
            <tr>
                <th>رقم الطلب</th>
                <th>الموظف</th>
                <th>التفاصيل</th>
                <th>الحالة</th>
                <th>بواسطة (الأدمن)</th>
                <th>التقييم</th>
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
            <td>${order.rating ? '⭐' + order.rating : '-'}</td>
            <td>${new Date(order.processedDate).toLocaleString('ar-EG')}</td>
        </tr>
    `).join('');

    html += `</tbody></table></div>`;

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

window.handleDecreaseStock = function (itemId) {
    const input = document.getElementById(`stock-input-${itemId}`);
    if (input.value > 0) {
        decreaseStock(itemId, input.value);
        input.value = '';
    } else {
        alert('الرجاء إدخال كمية صحيحة');
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

window.handleAddUser = function () {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    const roleSelect = document.getElementById('new-role');

    // Only Super Admin has the role select dropdown
    const role = roleSelect ? roleSelect.value : 'user';

    if (!username || !password) {
        alert('الرجاء إدخال اسم مستخدم وكلمة مرور');
        return;
    }

    createUser(username, password, role);
    // Clear inputs
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
};

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
