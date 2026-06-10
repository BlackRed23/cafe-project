import type { User } from "../types/auth.types";
import type { Product } from "../types/product.types";
import type { Order } from "../types/order.types";
import type { Inventory, InventoryTransaction } from "../types/inventory.types";
import type { Supplier, SupplierProduct } from "../types/supplier.types";
import type { PurchaseRequest } from "../types/purchaseRequest.types";
import type { AgentLog } from "../types/agentLog.types";
import type { Category } from "../types/category.types";

// Helper to load/save from localStorage
const getStorage = <T>(key: string, def: T): T => {
  const data = localStorage.getItem(`mock_${key}`);
  return data ? JSON.parse(data) : def;
};

const setStorage = <T>(key: string, val: T): void => {
  localStorage.setItem(`mock_${key}`, JSON.stringify(val));
};

// Initial mock data definitions
const defaultCategories: Category[] = [
  { id: "cat-1", name: "Cà phê pha phin", description: "Các loại hạt và bột cà phê pha phin truyền thống", isActive: true },
  { id: "cat-2", name: "Cà phê pha máy", description: "Các loại hạt cà phê nguyên chất dùng cho máy Espresso", isActive: true },
  { id: "cat-3", name: "Cà phê hòa tan", description: "Cà phê hòa tan tiện lợi nhanh chóng", isActive: true },
  { id: "cat-4", name: "Cà phê hạt nguyên chất", description: "Hạt cà phê nguyên bản, rang mộc", isActive: true },
];

const defaultProducts: Product[] = [
  { id: "p-1", name: "Cà phê Espresso Blend", description: "Hạt Espresso phối trộn Arabica & Robusta đậm vị, thơm nồng nàn.", price: 185000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-2", name: "Cà phê Arabica Honey", description: "Hạt Arabica chế biến ướt mật ong từ Lâm Đồng, hậu vị chua thanh ngọt nhẹ.", price: 240000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-3", name: "Cà phê Robusta Cầu Đất", description: "Robusta Cầu Đất rang đậm đà nguyên chất, thích hợp pha phin truyền thống.", price: 150000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-4", name: "Cà phê hòa tan 3in1", description: "Bịch 20 gói cà phê sữa hòa tan tiện lợi, thơm béo đậm đà.", price: 65000, unit: "bịch", imageUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400", categoryId: "cat-3", isActive: true },
  { id: "p-5", name: "Cold Brew Đóng Chai", description: "Chai thủy tinh 250ml cold brew Arabica nguyên chất pha ủ lạnh 18h.", price: 45000, unit: "chai", imageUrl: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=400", categoryId: "cat-2", isActive: true },
  { id: "p-6", name: "Cà phê Moka Cầu Đất", description: "Hạt Moka Cầu Đất rang mộc thượng hạng, thơm quyến rũ, vị đắng nhẹ tinh tế.", price: 280000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-7", name: "Cold Brew Cam Vàng", description: "Cold Brew tươi kết hợp nước ép cam vàng thanh mát, giải nhiệt mùa hè.", price: 49000, unit: "chai", imageUrl: "https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?auto=format&fit=crop&q=80&w=400", categoryId: "cat-2", isActive: true },
  { id: "p-8", name: "Cà phê Sữa Đá Sài Gòn", description: "Hộp 10 chai cà phê sữa đá pha sẵn chuẩn vị truyền thống đậm đà.", price: 195000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&q=80&w=400", categoryId: "cat-2", isActive: true },
  { id: "p-9", name: "Cà phê Drip Bag (Túi Lọc)", description: "Hộp 10 túi lọc cà phê Arabica tiện lợi cho văn phòng, giữ trọn hương vị.", price: 120000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400", categoryId: "cat-3", isActive: true },
  { id: "p-10", name: "Cà phê Espresso Decaf", description: "Hạt cà phê đã tách caffein nhưng vẫn giữ nguyên hương vị đậm đà nguyên bản.", price: 210000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-11", name: "Cà phê Coconut Latte Chai", description: "Latte cốt dừa béo ngậy kết hợp Espresso nguyên chất đóng chai thủy tinh.", price: 52000, unit: "chai", imageUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400", categoryId: "cat-2", isActive: true },
  { id: "p-12", name: "Cà phê Culi Robusta", description: "Hạt Culi Robusta Lâm Đồng chọn lọc, đắng đậm mạnh mẽ, hậu vị kéo dài.", price: 170000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true },
  { id: "p-13", name: "Cà phê Matcha Latte Sữa", description: "Sự kết hợp hoàn hảo giữa trà xanh Nhật Bản và espresso đậm đà đóng chai.", price: 55000, unit: "chai", imageUrl: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=400", categoryId: "cat-2", isActive: true },
  { id: "p-14", name: "Cà phê hòa tan đen đậm", description: "Hộp 20 gói cà phê đen hòa tan nguyên chất không đường, năng lượng tức thì.", price: 58000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400", categoryId: "cat-3", isActive: true },
  { id: "p-15", name: "Cà phê Hazelnut Espresso", description: "Hạt cà phê rang hương hạt dẻ thơm ngọt ấm áp, vị êm dịu.", price: 190000, unit: "hộp", imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400", categoryId: "cat-1", isActive: true }
];

const defaultInventories = (prods: Product[]): Inventory[] =>
  prods.map((p, idx) => ({
    id: `inv-${p.id}`,
    productId: p.id,
    product_id: p.id,
    product: { id: p.id, name: p.name, unit: p.unit, imageUrl: p.imageUrl },
    quantity: idx === 2 ? 3 : 15, // Make one item close to threshold (3)
    minThreshold: 5,
    min_threshold: 5,
  }));

const defaultSuppliers: Supplier[] = [
  { id: "sup-1", name: "Hợp tác xã Cà phê Lâm Đồng", email: "lamdong-coffee@supplier.local", phone: "02633888999", address: "Đà Lạt, Lâm Đồng" },
  { id: "sup-2", name: "Cà phê Hạt Trung Nguyên", email: "trungnguyen-supply@supplier.local", phone: "02839998888", address: "Quận 3, TP. Hồ Chí Minh" },
];

const defaultSupplierProducts = [
  { id: "sp-1", supplierId: "sup-1", supplier_id: "sup-1", productId: "p-1", product_id: "p-1", importPrice: 120000, minOrderQuantity: 10, leadTime: 3, priorityScore: 9 },
  { id: "sp-2", supplierId: "sup-1", supplier_id: "sup-1", productId: "p-2", product_id: "p-2", importPrice: 160000, minOrderQuantity: 5, leadTime: 3, priorityScore: 9 },
  { id: "sp-3", supplierId: "sup-2", supplier_id: "sup-2", productId: "p-3", product_id: "p-3", importPrice: 90000, minOrderQuantity: 20, leadTime: 2, priorityScore: 8 },
  { id: "sp-4", supplierId: "sup-2", supplier_id: "sup-2", productId: "p-4", product_id: "p-4", importPrice: 40000, minOrderQuantity: 50, leadTime: 2, priorityScore: 8 },
];

const defaultUsers: User[] = [
  { id: "u-admin", name: "Quản trị viên Cafe", email: "admin@cafe.com", role: "ADMIN", phone: "0901234567", is_active: true, isActive: true },
  { id: "u-customer-1", name: "Nguyễn Văn A", email: "customer1@gmail.com", role: "CUSTOMER", phone: "0987654321", is_active: true, isActive: true },
  { id: "u-customer-2", name: "Trần Thị B", email: "customer2@gmail.com", role: "CUSTOMER", phone: "0912345678", is_active: true, isActive: true },
  { id: "u-staff", name: "Nhân viên pha chế", email: "staff@cafe.com", role: "CUSTOMER", phone: "0934567890", is_active: true, isActive: true },
  { id: "u-customer-3", name: "Phạm Văn C", email: "customer3@gmail.com", role: "CUSTOMER", phone: "0976543210", is_active: true, isActive: true },
  { id: "u-customer-4", name: "Lê Thị D", email: "customer4@gmail.com", role: "CUSTOMER", phone: "0954321098", is_active: false, isActive: false },
  { id: "u-customer-5", name: "Hoàng Văn E", email: "customer5@gmail.com", role: "CUSTOMER", phone: "0943210987", is_active: true, isActive: true },
  { id: "u-customer-6", name: "Vũ Thị F", email: "customer6@gmail.com", role: "CUSTOMER", phone: "0965432109", is_active: true, isActive: true },
];

export const MockDB = {
  // Initialize mock store
  init: () => {
    const existingProds = localStorage.getItem("mock_products");
    const forceReset = !existingProds || JSON.parse(existingProds).length < 10;
    
    if (forceReset) {
      setStorage("products", defaultProducts);
      setStorage("inventories", defaultInventories(defaultProducts));
    }
    
    if (!localStorage.getItem("mock_suppliers")) setStorage("suppliers", defaultSuppliers);
    if (!localStorage.getItem("mock_supplier_products")) setStorage("supplier_products", defaultSupplierProducts);

    // Force migrate users if missing phone field
    const existingUsers = localStorage.getItem("mock_users");
    const forceResetUsers = !existingUsers || !JSON.parse(existingUsers)[0]?.phone;
    if (forceResetUsers) {
      setStorage("users", defaultUsers);
    }

    if (!localStorage.getItem("mock_orders")) setStorage("orders", [] as Order[]);
    if (!localStorage.getItem("mock_purchase_requests")) setStorage("purchase_requests", [] as PurchaseRequest[]);
    if (!localStorage.getItem("mock_agent_logs")) setStorage("agent_logs", [] as AgentLog[]);
    if (!localStorage.getItem("mock_transactions")) setStorage("transactions", [] as InventoryTransaction[]);
    if (!localStorage.getItem("mock_categories")) setStorage("categories", defaultCategories);
  },

  // Categories database
  getCategories: () => getStorage<Category[]>("categories", []),
  getCategory: (id: string) => getStorage<Category[]>("categories", []).find((c) => c.id === id),
  createCategory: (payload: Partial<Category>) => {
    const cats = getStorage<Category[]>("categories", []);
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: payload.name || "",
      description: payload.description,
      isActive: payload.isActive !== false,
    };
    cats.push(newCat);
    setStorage("categories", cats);
    return newCat;
  },
  updateCategory: (id: string, payload: Partial<Category>) => {
    const cats = getStorage<Category[]>("categories", []);
    const idx = cats.findIndex((c) => c.id === id);
    if (idx !== -1) {
      cats[idx] = { ...cats[idx], ...payload };
      setStorage("categories", cats);
      return cats[idx];
    }
    throw new Error("Không tìm thấy danh mục");
  },
  deleteCategory: (id: string) => {
    const cats = getStorage<Category[]>("categories", []);
    const filtered = cats.filter((c) => c.id !== id);
    setStorage("categories", filtered);
  },

  // Auth mock handlers
  login: (email: string): { user: User; token: string } => {
    const is_admin = email.includes("admin");
    const user: User = {
      id: is_admin ? "u-admin" : "u-customer",
      name: is_admin ? "Quản trị viên Cafe" : "Khách hàng thân thiết",
      email: email,
      role: is_admin ? "ADMIN" : "CUSTOMER",
    };
    return { user, token: "mock_jwt_token_key" };
  },

  // Product database
  getProducts: () => getStorage<Product[]>("products", []),
  getProduct: (id: string) => getStorage<Product[]>("products", []).find((p) => p.id === id),
  createProduct: (payload: Partial<Product>) => {
    const prods = getStorage<Product[]>("products", []);
    const newProd: Product = {
      id: `p-${Date.now()}`,
      name: payload.name || "",
      description: payload.description,
      price: payload.price || 0,
      unit: payload.unit || "hộp",
      imageUrl: payload.imageUrl || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400",
      categoryId: payload.categoryId || "cat-1",
      isActive: payload.isActive !== false,
    };
    prods.push(newProd);
    setStorage("products", prods);

    // Also initialize inventory item
    const invs = getStorage<Inventory[]>("inventories", []);
    invs.push({
      id: `inv-${newProd.id}`,
      productId: newProd.id,
      product_id: newProd.id,
      product: { id: newProd.id, name: newProd.name, unit: newProd.unit },
      quantity: 10,
      minThreshold: 5,
      min_threshold: 5,
    });
    setStorage("inventories", invs);

    return newProd;
  },
  updateProduct: (id: string, payload: Partial<Product>) => {
    const prods = getStorage<Product[]>("products", []);
    const idx = prods.findIndex((p) => p.id === id);
    if (idx !== -1) {
      prods[idx] = { ...prods[idx], ...payload };
      setStorage("products", prods);
      return prods[idx];
    }
    throw new Error("Không tìm thấy sản phẩm");
  },
  deleteProduct: (id: string) => {
    const prods = getStorage<Product[]>("products", []);
    const filtered = prods.filter((p) => p.id !== id);
    setStorage("products", filtered);
  },

  // Inventory database
  getInventories: () => getStorage<Inventory[]>("inventories", []),
  updateInventory: (productId: string, threshold: number) => {
    const invs = getStorage<Inventory[]>("inventories", []);
    const idx = invs.findIndex((i) => i.productId === productId);
    if (idx !== -1) {
      invs[idx].minThreshold = threshold;
      invs[idx].min_threshold = threshold;
      setStorage("inventories", invs);
      return invs[idx];
    }
    throw new Error("Không tìm thấy sản phẩm kho");
  },
  adjustInventory: (productId: string, quantity: number, type: "IMPORT" | "ADJUST", note?: string) => {
    const invs = getStorage<Inventory[]>("inventories", []);
    const idx = invs.findIndex((i) => i.productId === productId);
    if (idx !== -1) {
      const current = invs[idx].quantity;
      const nextQty = type === "IMPORT" ? current + quantity : current + quantity; // Adjust can be positive or negative
      invs[idx].quantity = Math.max(0, nextQty);
      setStorage("inventories", invs);

      // Create transaction record
      const txs = getStorage<InventoryTransaction[]>("transactions", []);
      const newTx: InventoryTransaction = {
        id: `tx-${Date.now()}`,
        productId,
        product_id: productId,
        product: { id: productId, name: invs[idx].product?.name || "Sản phẩm" },
        type: type === "IMPORT" ? "IMPORT" : "ADJUST",
        quantityChange: quantity,
        quantity_change: quantity,
        note: note || (type === "IMPORT" ? "Nhập thêm kho định kỳ" : "Kiểm kê điều chỉnh kho"),
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      txs.push(newTx);
      setStorage("transactions", txs);

      // Trigger AI Agent check
      MockDB.runAIAgentCheck(productId);
      return invs[idx];
    }
    throw new Error("Không tìm thấy sản phẩm");
  },
  getTransactions: () => getStorage<InventoryTransaction[]>("transactions", []),

  // Suppliers
  getSuppliers: () => getStorage<Supplier[]>("suppliers", []),
  createSupplier: (payload: Partial<Supplier>) => {
    const sups = getStorage<Supplier[]>("suppliers", []);
    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone,
      address: payload.address,
    };
    sups.push(newSup);
    setStorage("suppliers", sups);
    return newSup;
  },
  updateSupplier: (id: string, payload: Partial<Supplier>) => {
    const sups = getStorage<Supplier[]>("suppliers", []);
    const idx = sups.findIndex((s) => s.id === id);
    if (idx !== -1) {
      sups[idx] = { ...sups[idx], ...payload };
      setStorage("suppliers", sups);
      return sups[idx];
    }
    throw new Error("Không tìm thấy");
  },
  deleteSupplier: (id: string) => {
    const sups = getStorage<Supplier[]>("suppliers", []);
    setStorage("suppliers", sups.filter((s) => s.id !== id));
  },
  getSupplierProducts: () => getStorage<SupplierProduct[]>("supplier_products", []),
  createSupplierProduct: (payload: Partial<SupplierProduct>) => {
    const links = getStorage<SupplierProduct[]>("supplier_products", []);
    const newLink: SupplierProduct = {
      id: `sp-${Date.now()}`,
      supplierId: payload.supplierId || "",
      supplier_id: payload.supplierId || "",
      productId: payload.productId || "",
      product_id: payload.productId || "",
      importPrice: payload.importPrice || 50000,
      import_price: payload.importPrice || 50000,
      minOrderQuantity: payload.minOrderQuantity || 10,
      min_order_quantity: payload.minOrderQuantity || 10,
      leadTime: payload.leadTime || 3,
      lead_time: payload.leadTime || 3,
      priorityScore: payload.priorityScore || 1,
      priority_score: payload.priorityScore || 1,
    };
    links.push(newLink);
    setStorage("supplier_products", links);
    return newLink;
  },
  deleteSupplierProduct: (id: string) => {
    const links = getStorage<SupplierProduct[]>("supplier_products", []);
    setStorage("supplier_products", links.filter((l) => l.id !== id));
  },

  // Orders
  getOrders: () => getStorage<Order[]>("orders", []),
  createOrder: (payload: any) => {
    const orders = getStorage<Order[]>("orders", []);
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      userId: "u-customer",
      totalAmount: payload.items.reduce((sum: number, item: any) => {
        const prod = MockDB.getProduct(item.productId);
        return sum + (prod ? prod.price * item.quantity : 0);
      }, 0),
      status: "PENDING",
      paymentMethod: payload.paymentMethod,
      paymentStatus: "PENDING",
      shippingName: payload.shippingName,
      shippingPhone: payload.shippingPhone,
      shippingAddress: payload.shippingAddress,
      note: payload.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: payload.items.map((item: any, idx: number) => {
        const prod = MockDB.getProduct(item.productId);
        return {
          id: `item-${Date.now()}-${idx}`,
          orderId: `ord-${Date.now()}`,
          productId: item.productId,
          quantity: item.quantity,
          price: prod ? prod.price : 0,
          product: prod,
        };
      }),
    };

    orders.push(newOrder);
    setStorage("orders", orders);
    return newOrder;
  },
  confirmOrder: (orderId: string) => {
    const orders = getStorage<Order[]>("orders", []);
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      orders[idx].status = "CONFIRMED";
      orders[idx].paymentStatus = "PAID";
      orders[idx].updatedAt = new Date().toISOString();
      setStorage("orders", orders);

      // Reduce stock
      const invs = getStorage<Inventory[]>("inventories", []);
      const txs = getStorage<InventoryTransaction[]>("transactions", []);

      let triggeredPrId: string | undefined = undefined;

      orders[idx].items?.forEach((item) => {
        const iIdx = invs.findIndex((inv) => inv.productId === item.productId);
        if (iIdx !== -1) {
          invs[iIdx].quantity = Math.max(0, invs[iIdx].quantity - item.quantity);
          
          txs.push({
            id: `tx-${Date.now()}-${item.productId}`,
            productId: item.productId,
            product_id: item.productId,
            product: { id: item.productId, name: invs[iIdx].product?.name || "Sản phẩm" },
            type: "ORDER",
            quantityChange: -item.quantity,
            quantity_change: -item.quantity,
            note: `Trừ kho đơn hàng #${orderId.slice(-8).toUpperCase()}`,
            createdAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });

          setStorage("inventories", invs);
          setStorage("transactions", txs);

          // Run AI Check
          const pr = MockDB.runAIAgentCheck(item.productId);
          if (pr) {
            triggeredPrId = pr.id;
          }
        }
      });

      return { ...orders[idx], purchaseRequestId: triggeredPrId };
    }
    throw new Error("Không tìm thấy đơn hàng");
  },
  updateOrderStatus: (orderId: string, payload: { status?: string; paymentStatus?: string }) => {
    const orders = getStorage<Order[]>("orders", []);
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      if (payload.status) orders[idx].status = payload.status as any;
      if (payload.paymentStatus) orders[idx].paymentStatus = payload.paymentStatus as any;
      orders[idx].updatedAt = new Date().toISOString();
      setStorage("orders", orders);
      return orders[idx];
    }
    throw new Error("Không tìm thấy đơn hàng");
  },

  // Purchase Requests
  getPRs: () => getStorage<PurchaseRequest[]>("purchase_requests", []),
  getPR: (id: string) => getStorage<PurchaseRequest[]>("purchase_requests", []).find((pr) => pr.id === id),
  approvePR: (id: string) => {
    const prs = getStorage<PurchaseRequest[]>("purchase_requests", []);
    const idx = prs.findIndex((p) => p.id === id);
    if (idx !== -1) {
      prs[idx].status = "SENT";
      setStorage("purchase_requests", prs);

      // Increase stock by proposed amount since it's approved and received
      const invs = getStorage<Inventory[]>("inventories", []);
      const prodId = prs[idx].product?.id;
      const qty = prs[idx].suggestedQuantity ?? prs[idx].suggested_quantity ?? 0;
      if (prodId) {
        const iIdx = invs.findIndex((inv) => inv.productId === prodId);
        if (iIdx !== -1) {
          invs[iIdx].quantity += qty;
          setStorage("inventories", invs);

          // Log transaction
          const txs = getStorage<InventoryTransaction[]>("transactions", []);
          txs.push({
            id: `tx-pr-${Date.now()}`,
            productId: prodId,
            product_id: prodId,
            product: { id: prodId, name: prs[idx].product?.name || "Sản phẩm" },
            type: "IMPORT",
            quantityChange: qty,
            quantity_change: qty,
            note: `Nhập kho tự động từ duyệt Purchase Request #${id.slice(-8).toUpperCase()}`,
            createdAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
          setStorage("transactions", txs);
        }
      }

      return prs[idx];
    }
    throw new Error("Không tìm thấy PR");
  },
  rejectPR: (id: string, reason: string) => {
    const prs = getStorage<PurchaseRequest[]>("purchase_requests", []);
    const idx = prs.findIndex((p) => p.id === id);
    if (idx !== -1) {
      prs[idx].status = "REJECTED";
      prs[idx].reason = reason;
      setStorage("purchase_requests", prs);
      return prs[idx];
    }
    throw new Error("Không tìm thấy PR");
  },

  // Agent Logs
  getLogs: () => getStorage<AgentLog[]>("agent_logs", []),

  // Simulate Sale Simulation
  simulateSale: (productId: string, quantity: number) => {
    const invs = getStorage<Inventory[]>("inventories", []);
    const idx = invs.findIndex((i) => i.productId === productId);
    if (idx !== -1) {
      const current = invs[idx].quantity;
      invs[idx].quantity = Math.max(0, current - quantity);
      setStorage("inventories", invs);

      // Create transaction record
      const txs = getStorage<InventoryTransaction[]>("transactions", []);
      const newTx: InventoryTransaction = {
        id: `tx-${Date.now()}`,
        productId,
        product_id: productId,
        product: { id: productId, name: invs[idx].product?.name || "Sản phẩm" },
        type: "SIMULATE_SALE",
        quantityChange: -quantity,
        quantity_change: -quantity,
        note: `Bán giả lập nhanh ${quantity} ${invs[idx].product?.unit || "hộp"}`,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      txs.push(newTx);
      setStorage("transactions", txs);

      // Run AI Check
      const pr = MockDB.runAIAgentCheck(productId);
      return {
        success: true,
        purchaseRequestId: pr?.id || undefined,
        prCreated: !!pr,
        purchaseRequest: pr || null,
      };
    }
    throw new Error("Không tìm thấy sản phẩm");
  },

  // AI Agent Simulation Logic
  runAIAgentCheck: (productId: string): PurchaseRequest | null => {
    const invs = getStorage<Inventory[]>("inventories", []);
    const inv = invs.find((i) => i.productId === productId);
    if (!inv) return null;

    const qty = inv.quantity;
    const min = inv.minThreshold ?? inv.min_threshold ?? 5;

    // AI only acts if stock is below threshold
    if (qty < min) {
      // Find a supplier for this product
      const links = getStorage<SupplierProduct[]>("supplier_products", []);
      const supLink = links.find((l) => l.productId === productId || l.product_id === productId);
      const suppliers = getStorage<Supplier[]>("suppliers", []);
      const supplier = suppliers.find((s) => s.id === (supLink?.supplierId || supLink?.supplier_id)) || suppliers[0];

      const suggestedQty = (min * 3) - qty; // AI formula: Restock up to 3x min threshold

      const prId = `pr-${Date.now()}`;
      const pr: PurchaseRequest = {
        id: prId,
        status: "PENDING",
        reason: `Mức tồn kho hiện tại (${qty}) đã chạm/dưới ngưỡng an toàn (${min}). Đề xuất nhập thêm hàng từ đối tác để bù đắp thâm hụt chuỗi bán lẻ.`,
        aiReason: `Tự động phân tích: Sản phẩm "${inv.product?.name || "Sản phẩm"}" có lượng tồn là ${qty}, nhỏ hơn mức tối thiểu ${min}. Công thức AI Agent đề xuất số lượng nhập lý tưởng là ${suggestedQty} đơn vị để đạt mức dự trữ an toàn kế tiếp.`,
        suggestedQuantity: suggestedQty,
        suggested_quantity: suggestedQty,
        product: { id: productId, name: inv.product?.name || "Sản phẩm" },
        supplier: supplier ? { id: supplier.id, name: supplier.name, email: supplier.email } : undefined,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        emailContent: `Kính gửi đối tác ${supplier?.name || "Nhà cung cấp"},\n\nChúng tôi đại diện cho Cafe AI System có nhu cầu đặt mua lô hàng mới:\n- Sản phẩm: ${inv.product?.name || "Sản phẩm"}\n- Số lượng đặt mua: ${suggestedQty} ${inv.product?.unit || "đơn vị"}\n\nVui lòng xác nhận đơn hàng này và phản hồi thời gian giao hàng (Lead time dự kiến: ${supLink?.leadTime || 3} ngày).\n\nTrân trọng cảm ơn,\nAI Agent Cafe System`,
        email_content: `Kính gửi đối tác ${supplier?.name || "Nhà cung cấp"},\n\nChúng tôi đại diện cho Cafe AI System có nhu cầu đặt mua lô hàng mới:\n- Sản phẩm: ${inv.product?.name || "Sản phẩm"}\n- Số lượng đặt mua: ${suggestedQty} ${inv.product?.unit || "đơn vị"}\n\nVui lòng xác nhận đơn hàng này và phản hồi thời gian giao hàng (Lead time dự kiến: ${supLink?.leadTime || 3} ngày).\n\nTrân trọng cảm ơn,\nAI Agent Cafe System`
      };

      // Save PR
      const prs = getStorage<PurchaseRequest[]>("purchase_requests", []);
      prs.push(pr);
      setStorage("purchase_requests", prs);

      // Create Agent Log
      const logs = getStorage<AgentLog[]>("agent_logs", []);
      logs.push({
        id: `log-${Date.now()}`,
        action: "AUTO_RESTOCK",
        status: "SUCCESS",
        input: { productId, currentQuantity: qty, minThreshold: min },
        output: { purchaseRequestId: prId, suggestedQuantity: suggestedQty },
        reasoning: `Kiểm tra tồn kho cho thấy sản phẩm "${inv.product?.name}" chạm ngưỡng nguy hiểm (${qty}/${min}). Tìm thấy nhà cung cấp thích hợp: "${supplier?.name}". Tiến hành lập Purchase Request và soạn thảo email.`,
        purchaseRequestId: prId,
        purchase_request_id: prId,
        product: { id: productId, name: inv.product?.name || "Sản phẩm" },
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      setStorage("agent_logs", logs);

      return pr;
    } else {
      // Just create a normal check log
      const logs = getStorage<AgentLog[]>("agent_logs", []);
      logs.push({
        id: `log-${Date.now()}`,
        action: "CHECK_STOCK",
        status: "SUCCESS",
        input: { productId, currentQuantity: qty, minThreshold: min },
        output: { prCreated: false },
        reasoning: `Hệ thống thực hiện kiểm kho thường kỳ: Sản phẩm "${inv.product?.name}" có số lượng ${qty} (lớn hơn ngưỡng tối thiểu ${min}). Tồn kho an toàn, không cần đặt hàng thêm.`,
        product: { id: productId, name: inv.product?.name || "Sản phẩm" },
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      setStorage("agent_logs", logs);
    }
    return null;
  },

  // Users Database
  getUsers: () => getStorage<User[]>("users", []),
  createUser: (payload: Partial<User>) => {
    const users = getStorage<User[]>("users", []);
    const newUser: User = {
      id: `u-${Date.now()}`,
      name: payload.name || "",
      email: payload.email || "",
      role: payload.role || "CUSTOMER",
      phone: payload.phone || "",
      is_active: payload.is_active !== false,
      isActive: payload.is_active !== false,
    };
    users.push(newUser);
    setStorage("users", users);
    return newUser;
  },
  updateUser: (id: string, payload: Partial<User>) => {
    const users = getStorage<User[]>("users", []);
    const idx = users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...payload };
      setStorage("users", users);
      return users[idx];
    }
    throw new Error("Không tìm thấy người dùng");
  },
  deleteUser: (id: string) => {
    const users = getStorage<User[]>("users", []);
    const filtered = users.filter((u) => u.id !== id);
    setStorage("users", filtered);
  },
};
