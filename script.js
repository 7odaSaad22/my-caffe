// Enable Notification on first interaction
if (typeof document !== 'undefined') {
    document.addEventListener('click', () => {
        if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }, { once: true });
}

// Register Service Worker (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker registered!', reg))
            .catch(err => console.log('SW registration failed:', err));
    });
}

// ------------------------------------------------------------------
// GLOBAL STATE (CACHE)
// ------------------------------------------------------------------
let localInventory = [];
let localOrders = [];
let localUsers = [];
let currentCart = [];
let currentUser = null; // Store logged-in user info

// ------------------------------------------------------------------
// DATA FETCHING (SUPABASE)
// ------------------------------------------------------------------

async function fetchInventory() {
    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Error fetching inventory:', error);
        return [];
    }
    localInventory = data;
    return data;
}

async function fetchOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching orders:', error);
        return [];
    }
    localOrders = data;
    return data;
}

// ------------------------------------------------------------------
// REALTIME SUBSCRIPTION (AUTO-REFRESH)
// ------------------------------------------------------------------
let realtimeChannel = null;

function setupRealtimeSubscription() {
    if (!supabase) return;
    if (realtimeChannel) {
        console.log('Realtime subscription already active.');
        return;
    }

    console.log('Setting up Realtime subscription...');
    realtimeChannel = supabase
        .channel('table-db-changes')
        .on(
            'postgres_changes',
            {
                event: '*', // Listen to INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'orders',
            },
            (payload) => {
                console.log('Realtime change received!', payload);

                // Notify logic
                if (payload.eventType === 'INSERT') {
                    // Update badges
                    const badgeSide = document.getElementById('orders-badge-side');

                    if (badgeSide) {
                        badgeSide.style.display = 'inline-block';
                        badgeSide.textContent = parseInt(badgeSide.textContent || '0') + 1;
                    }

                    // Show Toast (In-App)
                    if (typeof showNotification === 'function') {
                        showNotification('🔔 طلب جديد وصل!', 'success');
                    }

                    // Show System Notification (Browser)
                    if (Notification.permission === 'granted') {
                        new Notification("طلب قهوة جديد ☕", {
                            body: "هناك طلب جديد بانتظار الموافقة!",
                            icon: "https://cdn-icons-png.flaticon.com/512/751/751663.png"
                        });
                    } else if (Notification.permission !== 'denied') {
                        Notification.requestPermission();
                    }

                    // Play sound
                    try {
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.volume = 0.5;
                        audio.play().catch(e => console.log('Audio play blocked'));
                    } catch (e) { }
                }

                // Refresh data
                fetchOrders().then(() => {
                    // Refresh UI based on current page context
                    if (typeof renderAdminOrders === 'function' && document.getElementById('orders-container')) {
                        renderAdminOrders();
                    }
                    if (typeof renderUserOrders === 'function' && document.getElementById('user-orders-container')) {
                        renderUserOrders();
                    }
                });
            }
        )
        .subscribe();
}

// UI Helpers
function toggleSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

function showNotification(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', info: '🔔', warning: '⚠️' };
    toast.innerHTML = `
        <span style="font-size:1.2rem">${icons[type] || '🔔'}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ------------------------------------------------------------------
// DARK MODE
// ------------------------------------------------------------------
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    document.querySelectorAll('.dark-mode-btn').forEach(btn => {
        btn.textContent = isDark ? '☀️' : '🌙';
    });
}

function loadDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        document.querySelectorAll('.dark-mode-btn').forEach(btn => {
            btn.textContent = '☀️';
        });
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', loadDarkMode);
}

// ------------------------------------------------------------------
// SEARCH / FILTER
// ------------------------------------------------------------------
function filterMenu() {
    const query = document.getElementById('menu-search-input');
    if (!query) return;
    renderMenu(query.value.trim().toLowerCase());
}

async function fetchUsers() {
    const { data, error } = await supabase
        .from('app_users')
        .select('*');

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }
    localUsers = data;
    return data;
}

// ------------------------------------------------------------------
// CART & ORDER LOGIC (User Side)
// ------------------------------------------------------------------

function addToCart(itemId) {
    const item = localInventory.find(i => i.id == itemId);

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
        showNotification("عذراً، الكمية المتاحة في المخزن لا تكفي لإضافة المزيد من هذا الصنف", "warning");
    }
}

function removeFromCart(index) {
    currentCart.splice(index, 1);
    renderCartUI();
}

async function submitOrder(employeeName, note) {
    if (currentCart.length === 0) {
        showNotification("السلة فارغة!", "warning");
        return;
    }

    // Double check stock one last time from Server
    await fetchInventory(); // Refresh stock
    for (const cartItem of currentCart) {
        const stockItem = localInventory.find(i => i.id == cartItem.itemId);
        const inCartCount = currentCart.filter(c => c.itemId === cartItem.itemId).length;
        if (!stockItem || stockItem.stock < inCartCount) {
            showNotification(`عذراً، الكمية المطلوبة من ${cartItem.name} غير متوفرة حالياً.`, "warning");
            return;
        }
    }

    const newOrder = {
        employee_name: employeeName,
        items: currentCart, // JSONB structure
        note: note,
        status: 'pending',
        date: new Date().toISOString()
    };

    const { error } = await supabase
        .from('orders')
        .insert([newOrder]);

    if (error) {
        showNotification("حدث خطأ أثناء إرسال الطلب: " + error.message, "error");
    } else {
        // Clear cart
        currentCart = [];
        renderCartUI();
        document.getElementById('order-note').value = ''; // Clear note
        await renderUserOrders(); // Refresh history
        showNotification("تم إرسال طلبك بنجاح!", "success");
    }
}

async function handleSubmitOrder() {
    const employeeName = document.getElementById('employee-name').value.trim();
    const note = document.getElementById('order-note').value;

    if (!employeeName) {
        showNotification("الرجاء التأكد من كتابة الاسم.", "warning");
        return;
    }

    await submitOrder(employeeName, note);
}

async function cancelOrder(orderId) {
    if (!confirm("هل أنت متأكد من إلغاء الطلب؟")) return;

    // Get order to check status one last time
    await fetchOrders();
    const order = localOrders.find(o => o.id == orderId);
    if (!order) return;

    // Allow cancellation if pending or preparing
    if (order.status !== 'pending' && order.status !== 'preparing') {
        showNotification("عذراً، لا يمكن إلغاء الطلب لأنه تم تسليمه أو إلغاؤه بالفعل.", "warning");
        return;
    }

    // If order was preparing, we must return the stock!
    if (order.status === 'preparing') {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const itemsToReturn = {};
        items.forEach(item => {
            itemsToReturn[item.itemId] = (itemsToReturn[item.itemId] || 0) + 1;
        });

        // Return stock
        await fetchInventory();
        for (const [itemId, qty] of Object.entries(itemsToReturn)) {
            const inventoryItem = localInventory.find(i => i.id == itemId);
            if (inventoryItem) {
                await supabase
                    .from('inventory')
                    .update({ stock: inventoryItem.stock + qty })
                    .eq('id', itemId);
            }
        }
    }

    const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

    if (error) {
        showNotification("خطأ في الإلغاء: " + error.message, "error");
    } else {
        showNotification("تم إلغاء الطلب بنجاح.", "success");
        renderUserOrders(); // Refresh user view
        // If admin is viewing, realtime will update them or they refresh
    }
}

// ------------------------------------------------------------------
// USER MANAGEMENT
// ------------------------------------------------------------------

async function createUser(username, password, role = 'user') {
    // Check if user exists
    const users = await fetchUsers();
    if (users.find(u => u.username === username)) {
        // alert('اسم المستخدم هذا موجود بالفعل!'); // Silent fail for bulk upload or handle differently
        return { success: false, message: 'المستخدم موجود مسبقاً' };
    }

    const { error } = await supabase
        .from('app_users')
        .insert([{ username, password, role }]);

    if (error) {
        return { success: false, message: error.message };
    }

    return { success: true };
}

async function handleAddUser() {
    const u = document.getElementById('new-username').value;
    const p = document.getElementById('new-password').value;
    const rElement = document.getElementById('new-role');
    const r = rElement ? rElement.value : 'user';

    if (!u || !p) {
        showNotification("الرجاء إدخال البيانات", "warning");
        return;
    }

    const result = await createUser(u, p, r);
    if (result.success) {
        showNotification("تم إنشاء المستخدم بنجاح", "success");
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        await renderUserManagement();
    } else {
        showNotification("خطأ: " + result.message, "error");
    }
}


async function deleteUser(username) {
    if (username === 'admin' || username === 'hitler') {
        showNotification("لا يمكن حذف المدير العام", "warning");
        return;
    }
    if (confirm(`هل أنت متأكد من حذف المستخدم ${username}؟`)) {
        const { error } = await supabase
            .from('app_users')
            .delete()
            .eq('username', username);

        if (error) showNotification("خطأ: " + error.message, "error");
        else await renderUserManagement();
    }
}

async function updateUserRole(username, newRole) {
    if (username === 'admin' || username === 'hitler') {
        showNotification("لا يمكن تغيير صلاحيات المدير العام", "warning");
        return;
    }
    const { error } = await supabase
        .from('app_users')
        .update({ role: newRole })
        .eq('username', username);

    if (error) showNotification("خطأ: " + error.message, "error");
    else {
        await renderUserManagement();
        showNotification(`تم تغيير صلاحية ${username} إلى ${translateRole(newRole)}`, "success");
    }
}

async function verifyUserCredentials(username, password) {
    if (!supabase) {
        // Try one last time to init
        if (typeof initSupabase === 'function') initSupabase();
        if (!supabase) {
            showNotification("خطأ: لم يتم تحميل مكتبة الاتصال بعد. الرجاء تحديث الصفحة.", "error");
            return false;
        }
    }

    // Fetch specifically this user
    const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

    if (error) {
        // Debugging: Show database error if any
        // alert('حدث خطأ في الاتصال بقاعدة البيانات: ' + error.message);
        console.error(error);
        return false;
    }
    if (!data) return false;
    return data;
}

function translateRole(role) {
    if (role === 'super_admin') return 'مدير عام 👑';
    if (role === 'admin') return 'أدمن 🛠️';
    return 'عميل 👤';
}

// ------------------------------------------------------------------
// ADMIN ACTIONS & EXCEL & HELPERS
// ------------------------------------------------------------------

function getAdminName() {
    const name = localStorage.getItem('admin_name');
    return name ? name : 'غير معروف';
}

// Accept Order (Move to Preparing)
async function handleApprove(orderId) {
    // Deduct stock immediately upon acceptance

    // 1. Get order details to know what to deduct
    const order = localOrders.find(o => o.id == orderId);
    if (!order) return;

    const itemsToDeduct = {};
    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    orderItems.forEach(item => {
        itemsToDeduct[item.itemId] = (itemsToDeduct[item.itemId] || 0) + 1;
    });

    // 2. Validate Stock
    await fetchInventory();
    for (const [itemId, qty] of Object.entries(itemsToDeduct)) {
        const inventoryItem = localInventory.find(i => i.id == itemId);
        if (!inventoryItem || inventoryItem.stock < qty) {
            showNotification(`لا يمكن الموافقة: الكمية غير كافية للصنف`, "error");
            return;
        }
    }

    // 3. Update Inventory
    for (const [itemId, qty] of Object.entries(itemsToDeduct)) {
        const inventoryItem = localInventory.find(i => i.id == itemId);
        await supabase
            .from('inventory')
            .update({ stock: inventoryItem.stock - qty })
            .eq('id', itemId);
    }

    // 4. Update Status to 'preparing'
    const { error } = await supabase
        .from('orders')
        .update({
            status: 'preparing', // قيد التحضير
            processed_by: getAdminName()
            // We set processed_date only on final delivery? Or now? Let's say now.
            // But if we want to track 'delivery time', maybe we update it later. 
            // For report purposes, let's keep processed_date as the time admin accepted it.
        })
        .eq('id', orderId);

    if (!error) {
        await renderAdminDashboard();
    }
}

// Confirm Delivery (Move to Approved/Delivered)
async function handleConfirmDelivery(orderId) {
    const { error } = await supabase
        .from('orders')
        .update({
            status: 'approved', // This means "Delivered/Completed" in our logic
            processed_date: new Date().toISOString()
        })
        .eq('id', orderId);

    if (!error) {
        await renderAdminDashboard();
    }
}

async function handleReject(orderId) {
    const { error } = await supabase
        .from('orders')
        .update({
            status: 'rejected',
            processed_date: new Date().toISOString(),
            processed_by: getAdminName()
        })
        .eq('id', orderId);

    if (!error) {
        await renderAdminDashboard();
    }
}

async function handleResetInventory() {
    if (!confirm("⚠️ هل أنت متأكد من تصفير (مسح) كميات جميع المنتجات؟ لا يمكن التراجع عن هذا الإجراء.")) return;

    // We need to update all rows stock to 0.
    // Supabase update without 'where' might be blocked, so loop best.
    const failed = [];
    for (const item of localInventory) {
        const { error } = await supabase
            .from('inventory')
            .update({ stock: 0 })
            .eq('id', item.id);

        if (error) failed.push(item.name);
    }

    if (failed.length > 0) {
        showNotification("حدث خطأ في تصفير: " + failed.join(", "), "error");
    } else {
        showNotification("تم تصفير المخزون بنجاح!", "success");
    }
    renderInventory();
}

async function handleUsersUpload(file) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            // Access global wrapper or direct call
            let count = 0;
            let errors = 0;

            for (const row of json) {
                // Expect keys: username, password
                // Try case insensitive keys?
                const username = row.username || row.Username || row['اسم المستخدم'];
                const password = row.password || row.Password || row['كلمة المرور'];
                const role = row.role || row.Role || 'user';

                if (username && password) {
                    const res = await createUser(String(username), String(password), String(role));
                    if (res.success) count++;
                    else errors++;
                }
            }

            showNotification(`تمت العملية: نجاح: ${count} | فشل/مكرر: ${errors}`, "success");
            renderUserManagement();

        } catch (err) {
            console.error(err);
            showNotification("خطأ في قراءة ملف الإكسل. تأكد من الصيغة.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

async function exportMonthlyReport() {
    const monthVal = document.getElementById('report-month').value;

    // Fetch all orders
    await fetchOrders();

    // Filter
    let filteredOrders = localOrders.filter(o => o.status === 'approved'); // Only completed orders

    if (monthVal) {
        filteredOrders = filteredOrders.filter(o => {
            const d = new Date(o.date);
            return (d.getMonth() + 1) == monthVal;
        });
    }

    if (filteredOrders.length === 0) {
        showNotification("لا توجد بيانات لهذا الشهر.", "warning");
        return;
    }

    // Format for Excel
    const reportData = filteredOrders.map(o => {
        let itemsStr = "";
        try {
            const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            itemsStr = items.map(i => i.name).join(", ");
        } catch (e) { }

        return {
            "ID": o.id,
            "الموظف": o.employee_name,
            "الطلبات": itemsStr,
            "ملاحظات": o.note || "",
            "التاريخ": new Date(o.date).toLocaleDateString('ar-EG'),
            "الوقت": new Date(o.date).toLocaleTimeString('ar-EG'),
            "بواسطة": o.processed_by || "",
            "التقييم": o.rating || "-"
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "التقرير");

    const fileName = `Report_${monthVal ? 'Month_' + monthVal : 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}


// Inventory Helpers
async function addStock(itemId, quantityAdd) {
    const currentItem = localInventory.find(i => i.id == itemId);
    if (!currentItem) return;

    const newStock = currentItem.stock + parseInt(quantityAdd);
    const { error } = await supabase
        .from('inventory')
        .update({ stock: newStock })
        .eq('id', itemId);

    if (error) showNotification("Error: " + error.message, "error");
    else {
        showNotification(`تم إضافة ${quantityAdd} إلى ${currentItem.name}`, "success");
        await renderAdminDashboard();
    }
}

async function decreaseStock(itemId, quantitySub) {
    const currentItem = localInventory.find(i => i.id == itemId);
    if (!currentItem) return;

    const qty = parseInt(quantitySub);
    if (qty <= 0) return;
    if (currentItem.stock < qty) {
        showNotification("الكمية المراد خصمها أكبر من المتوفر", "warning");
        return;
    }

    const { error } = await supabase
        .from('inventory')
        .update({ stock: currentItem.stock - qty })
        .eq('id', itemId);

    if (error) showNotification("Error: " + error.message, "error");
    else {
        showNotification(`تم خصم ${qty} من ${currentItem.name}`, "success");
        await renderAdminDashboard();
    }
}

async function addNewProductInternal(name, stock) {
    const { error } = await supabase
        .from('inventory')
        .insert([{ name, stock: parseInt(stock) }]);

    if (error) showNotification("Error: " + error.message, "error");
    else {
        showNotification("تم إضافة المنتج بنجاح", "success");
        await renderAdminDashboard();
    }
}

async function deleteProductInternal(itemId) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        const { error } = await supabase
            .from('inventory')
            .delete()
            .eq('id', itemId);

        if (!error) {
            showNotification("تم حذف المنتج بنجاح", "success");
            await renderAdminDashboard();
        }
    }
}

// ------------------------------------------------------------------
// UI RENDERING & HANDLERS
// ------------------------------------------------------------------

// Login Handler (Async wrapper)
window.handleLogin = async function () {
    try {
        // Ensure initialization
        if (!supabase && typeof initSupabase === 'function') {
            initSupabase();
        }

        if (!supabase) {
            // Wait a moment and try again
            await new Promise(r => setTimeout(r, 500));
            if (typeof initSupabase === 'function') initSupabase();
        }

        if (!supabase) {
            showNotification("خطأ: لم يتم تحميل مكتبة الاتصال بعد. الرجاء المحاولة مرة أخرى بعد ثوانٍ.", "error");
            return;
        }

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('error-msg');

        if (!username || !password) {
            showNotification("الرجاء إدخال اسم المستخدم وكلمة المرور", "warning");
            return;
        }

        errorMsg.style.display = 'none';

        // Show loading indicator (optional)
        document.querySelector('button').textContent = 'جارٍ التحقق...';

        const user = await verifyUserCredentials(username, password);

        // Reset button text
        document.querySelector('button').textContent = 'دخول';

        if (user) {
            if (user.role === 'admin' || user.role === 'super_admin') {
                localStorage.setItem('admin_name', user.username);
                window.location.href = 'admin.html';
            } else {
                localStorage.setItem('last_user_name', user.username);
                window.location.href = 'user.html';
            }
        } else {
            errorMsg.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة!';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        showNotification("حدث خطأ غير متوقع: " + err.message, "error");
        console.error(err);
        if (document.querySelector('button')) document.querySelector('button').textContent = 'دخول';
    }
};

// --- FORGOT PASSWORD LOGIC ---
let userToReset = null;

window.toggleForgotView = function (show) {
    document.getElementById('main-login-card').style.display = show ? 'none' : 'block';

    // Only access these if they exist (they are on index.html)
    const forgotCard = document.getElementById('forgot-card');
    if (forgotCard) {
        forgotCard.style.display = show ? 'block' : 'none';
        document.getElementById('reset-card').style.display = 'none';
        document.getElementById('forgot-error').style.display = 'none';
        document.getElementById('reset-error').style.display = 'none';
        document.getElementById('forgot-username').value = '';
        document.getElementById('forgot-new-password').value = '';
    }
    userToReset = null;
};

window.handleVerifyUser = async function () {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) {
        const err = document.getElementById('forgot-error');
        err.textContent = 'الرجاء إدخال اسم المستخدم أو الإيميل!';
        err.style.display = 'block';
        return;
    }

    const btn = document.querySelector('#forgot-card button');
    btn.textContent = 'جارٍ التحقق...';

    // Search for user
    const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .single();

    btn.textContent = 'تحقق من الحساب';

    if (error || !data) {
        const err = document.getElementById('forgot-error');
        err.textContent = 'نأسف، لم نجد هذا الحساب ضمن قائمة العملاء!';
        err.style.display = 'block';
        return;
    }

    // Security block: only allow 'user' role to change password this way
    if (data.role !== 'user') {
        const err = document.getElementById('forgot-error');
        err.textContent = 'لا يمكن تغيير كلمة سر هذا الحساب (خاص بالإدارة). للمساعدة تواصل مع الدعم.';
        err.style.display = 'block';
        return;
    }

    // Success - user found
    userToReset = data.username;
    document.getElementById('forgot-card').style.display = 'none';
    document.getElementById('reset-card').style.display = 'block';
    document.getElementById('reset-user-name-display').textContent = `الحساب المُراد تعديله: ${userToReset}`;
};

window.handleSaveNewPassword = async function () {
    const newPassword = document.getElementById('forgot-new-password').value;
    if (!newPassword || newPassword.length < 3) {
        const err = document.getElementById('reset-error');
        err.textContent = 'تعيين كلمة السر الجديدة يقتضي أن تكون 3 رموز على الأقل.';
        err.style.display = 'block';
        return;
    }

    const btn = document.querySelector('#reset-card button.btn-success');
    btn.textContent = 'جارٍ الحفظ...';

    const { error } = await supabase
        .from('app_users')
        .update({ password: newPassword })
        .eq('username', userToReset);

    btn.textContent = 'حفظ والتسجيل';

    if (error) {
        const err = document.getElementById('reset-error');
        err.textContent = 'حدث خطأ: ' + error.message;
        err.style.display = 'block';
    } else {
        showNotification("تم تغيير كلمة السر بنجاح!", "success");

        // Auto-fill the inputs and switch to login
        window.toggleForgotView(false);
        document.getElementById('username').value = userToReset;
        document.getElementById('password').value = newPassword;
    }
};

// --- USER SIDE ---

async function renderMenu(searchQuery = '') {
    const container = document.getElementById('menu-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; width:100%">جارٍ التحميل...</p>';
    await fetchInventory();

    let filteredInventory = localInventory;
    if (searchQuery) {
        filteredInventory = localInventory.filter(item => item.name.toLowerCase().includes(searchQuery));
    }

    if (filteredInventory.length === 0) {
        container.innerHTML = '<p style="text-align:center; width:100%">لا توجد نتائج للبحث</p>';
        return;
    }

    container.innerHTML = filteredInventory.map(item => `
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

async function submitRating(orderId) {
    const ratingVal = document.getElementById(`rate-${orderId}`).value;

    // Optimistic Update
    const { error } = await supabase
        .from('orders')
        .update({ rating: parseInt(ratingVal) })
        .eq('id', orderId);

    if (!error) {
        showNotification("شكراً لتقييمك!", "success");
        renderUserOrders();
    }
}

async function renderUserOrders() {
    const lastUser = localStorage.getItem('last_user_name');
    if (!lastUser) return;

    const container = document.getElementById('user-orders-container');
    if (!container) return;

    // container.innerHTML = '<p>جارٍ تحميل الطلبات...</p>'; // Optional loading state

    // Filter specifically for this user via Supabase would be better, but filtering locally for now matches structure
    await fetchOrders();
    const orders = localOrders.filter(o => o.employee_name === lastUser);

    if (orders.length === 0) {
        container.innerHTML = '<p>لا توجد طلبات سابقة لهذا الاسم.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        // UI for Admin Name
        const adminInfo = order.processed_by
            ? `<div style="margin-top:5px; font-size:0.85rem; color:#555; background:rgba(0,0,0,0.05); padding:5px; border-radius:4px;">
                👷‍♂️ المسؤول: <strong>${order.processed_by}</strong>
               </div>`
            : '';

        // UI for Rating
        let ratingSection = '';
        if (order.status === 'approved') {
            if (order.rating) {
                ratingSection = `<div style="margin-top:5px; color:#ffc107; font-size:1.2rem;">
                    ${'★'.repeat(order.rating)}${'☆'.repeat(5 - order.rating)}
                </div>`;
            } else {
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

        let statusText = '';
        let statusClass = '';
        if (order.status === 'pending') { statusText = 'قيد الانتظار ⏳'; statusClass = 'pending'; }
        else if (order.status === 'preparing') { statusText = 'قيد التحضير 🍳'; statusClass = 'pending'; }
        else if (order.status === 'approved') { statusText = 'تم التسليم ✅'; statusClass = 'approved'; }
        else if (order.status === 'rejected') { statusText = 'مرفوض ❌'; statusClass = 'rejected'; }
        else if (order.status === 'cancelled') { statusText = 'ملغي 🚫'; statusClass = 'rejected'; }


        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

        let cancelButton = '';
        // Allow cancel if pending OR preparing
        if (order.status === 'pending' || order.status === 'preparing') {
            cancelButton = `<button onclick="cancelOrder(${order.id})" class="btn btn-danger btn-sm" style="margin-top:5px">🚫 إلغاء الطلب</button>`;
        }

        return `
        <div class="order-status-card status-${statusClass}">
            <div style="display:flex; justify-content:space-between">
                <strong>طلب #${order.id}</strong>
                <span style="font-size:0.9rem">${new Date(order.date).toLocaleString('ar-EG')}</span>
            </div>
            <p>
                ${items.map(i => i.name).join(' + ')} 
                ${items.length > 1 ? `(${items.length} أصناف)` : ''}
            </p>
            ${order.note ? `<p style="color:#666; font-size:0.9rem">📝 ملاحظة: ${order.note}</p>` : ''}
            
            <div style="margin-top:5px; font-weight:bold">
                الحالة: ${statusText}
            </div>
            
            ${cancelButton}

            ${adminInfo}
            ${ratingSection}
        </div>
    `}).join('');
}

// --- ADMIN SIDE ---

async function renderAdminDashboard() {
    await Promise.all([fetchOrders(), fetchInventory(), fetchUsers()]);
    // Start listening for live updates
    setupRealtimeSubscription();

    // Request notification permission early
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    renderAdminOrders();
    renderInventory();
    renderReports();
    renderUserManagement();
}

async function renderUserManagement() {
    const container = document.getElementById('users-management-container');
    if (!container) return;

    await fetchUsers(); // Refresh
    const currentAdminName = localStorage.getItem('admin_name');
    const currentUser = localUsers.find(u => u.username === currentAdminName);
    const isSuperAdmin = currentUser && currentUser.role === 'super_admin';

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
    
    <h3 style="margin-top:20px">قائمة المستخدمين (${localUsers.length})</h3>
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

    if (localUsers.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center">لا يوجد مستخدمين مسجلين حالياً</td></tr>`;
    } else {
        html += localUsers.map(user => {
            let actions = '';
            if (isSuperAdmin && user.role !== 'super_admin') {
                actions += `<button class="btn btn-danger btn-sm" onclick="deleteUser('${user.username}')">حذف</button> `;
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
                <td><span class="password-hidden" onclick="this.textContent = this.textContent === '****' ? '${user.password}' : '****'">****</span></td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('ar-EG') : '-'}</td>
                <td><div style="display:flex; gap:5px; justify-content:center;">${actions}</div></td>
            </tr>
        `}).join('');
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderAdminOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    // Filter logic: show pending and preparing
    const activeOrders = localOrders.filter(o => o.status === 'pending' || o.status === 'preparing');

    if (activeOrders.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">لا توجد طلبات نشطة حالياً.</p>';
        return;
    }

    let html = `
    <div class="table-responsive">
    <table>
        <thead>
            <tr>
                <th>رقم الطلب</th>
                <th>الموظف</th>
                <th>الحالة</th>
                <th>التفاصيل</th>
                <th>ملاحظات</th>
                <th>الوقت</th>
                <th>إجراءات</th>
            </tr>
        </thead>
        <tbody>`;

    html += activeOrders.map(order => {
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

        let mainAction = '';
        if (order.status === 'pending') {
            mainAction = `<button class="btn btn-success btn-sm" onclick="handleApprove(${order.id})">✅ قبول (تحضير)</button>`;
        } else if (order.status === 'preparing') {
            mainAction = `<button class="btn btn-sm" style="background:#007bff; color:white" onclick="handleConfirmDelivery(${order.id})">🚚 تأكيد التسليم</button>`;
        }

        return `
        <tr style="${order.status === 'preparing' ? 'background:#e3f2fd' : ''}">
            <td>#${order.id}</td>
            <td>${order.employee_name}</td>
            <td>${order.status === 'pending' ? '⏳ انتظار' : '🍳 تحضير'}</td>
            <td>
                ${items.map(i => `<div>- ${i.name}</div>`).join('')}
            </td>
            <td>${order.note || '-'}</td>
            <td>${new Date(order.date).toLocaleTimeString('ar-EG')}</td>
            <td>
                <div style="display:flex; gap:5px; flex-wrap:wrap">
                    ${mainAction}
                    <button class="btn btn-danger btn-sm" onclick="handleReject(${order.id})">رفض</button>
                </div>
            </td>
        </tr>
    `}).join('');

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderInventory() {
    const container = document.getElementById('inventory-container');
    if (!container) return;

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

    html += localInventory.map(item => `
        <tr>
            <td>${item.name}</td>
            <td><strong>${item.stock}</strong></td>
            <td>
                <div style="display:flex; gap:5px; justify-content:center; align-items:center;">
                    <input type="number" id="stock-input-${item.id}" placeholder="الكمية" style="width:60px; padding:5px">
                    <button class="btn btn-sm" onclick="addStock(${item.id}, document.getElementById('stock-input-${item.id}').value)">+</button>
                    <button class="btn btn-sm" style="background:#ffc107; color:black" onclick="decreaseStock(${item.id}, document.getElementById('stock-input-${item.id}').value)">-</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProductInternal(${item.id})">حذف</button>
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

    // Filter logic: Only approved (delivered)
    const orders = localOrders
        .filter(o => o.status === 'approved')
        .sort((a, b) => new Date(b.processed_date) - new Date(a.processed_date));

    // Stats
    const totalOrders = orders.length;

    // Admin Ratings
    const adminStats = {};
    orders.forEach(o => {
        if (o.processed_by && o.rating) {
            if (!adminStats[o.processed_by]) {
                adminStats[o.processed_by] = { totalRating: 0, count: 0 };
            }
            adminStats[o.processed_by].totalRating += o.rating;
            adminStats[o.processed_by].count += 1;
        }
    });

    if (statsContainer) {
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
                    <tbody>`;

        for (const [admin, data] of Object.entries(adminStats)) {
            const avg = (data.totalRating / data.count).toFixed(1);
            ratingHtml += `
                <tr>
                    <td style="padding:8px;">${admin}</td>
                    <td style="padding:8px;">${data.count}</td>
                    <td style="padding:8px;">⭐ ${avg}</td>
                </tr>
            `;
        }
        ratingHtml += `</tbody></table></div></div>`;

        statsContainer.innerHTML = `
            <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:10px;">
                <div style="background:#e3f2fd; padding:15px; border-radius:8px; flex:1; text-align:center;">
                    <h4>إجمالي الطلبات المسلمة</h4>
                    <span style="font-size:1.5rem; font-weight:bold; color:var(--primary-color)">${totalOrders}</span>
                </div>
            </div>
            ${Object.keys(adminStats).length > 0 ? ratingHtml : ''}
        `;
    }

    if (orders.length === 0) {
        container.innerHTML = '<p>لا توجد طلبات مكتملة.</p>';
    } else {
        let html = `
        <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>رقم الطلب</th>
                    <th>الموظف</th>
                    <th>التفاصيل</th>
                    <th>بواسطة</th>
                    <th>وقت التسليم</th>
                    <th>التقييم</th>
                </tr>
            </thead>
            <tbody>`;

        html += orders.map(order => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const rating = order.rating ? '⭐'.repeat(order.rating) : '-';
            return `
            <tr>
                <td>#${order.id}</td>
                <td>${order.employee_name}</td>
                <td>${items.map(i => i.name).join(', ')}</td>
                <td>${order.processed_by || '-'}</td>
                <td>${new Date(order.processed_date).toLocaleString('ar-EG')}</td>
                <td>${rating}</td>
            </tr>
        `}).join('');

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }
}
