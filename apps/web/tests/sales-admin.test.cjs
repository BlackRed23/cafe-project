const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"),
    {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      assert.ok(name in mocks, name);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const helper = load("src/pages/admin/salesFeedback.ts");
const httpError = (status, message) => ({
  response: { status, data: { message } },
});
test("Lifecycle separates confirmation/preparation/completion and blocks invalid terminal actions", () => {
  const row = {
    status: "PENDING",
    paymentMethod: "CASH",
    paymentStatus: "PENDING",
  };
  assert.equal(helper.nextStatus(row), "CONFIRMED");
  assert.equal(
    helper.nextStatus({ ...row, status: "PROCESSING" }),
    "PREPARING",
  );
  assert.equal(
    helper.displayStatus({
      ...row,
      status: "PROCESSING",
      displayStatus: "CONFIRMED",
    }),
    "CONFIRMED",
  );
  assert.equal(helper.nextStatus({ ...row, status: "PREPARING" }), "COMPLETED");
  for (const status of ["CANCELLED", "COMPLETED"])
    assert.equal(helper.nextStatus({ ...row, status }), undefined);
  assert.equal(helper.canEditItems(row), true);
  for (const patch of [
    { status: "PREPARING" },
    { stockDeductedAt: "now" },
    { paymentStatus: "PAID" },
    { paymentMethod: "MOMO" },
    { payment: { status: "PAID" } },
  ])
    assert.equal(helper.canEditItems({ ...row, ...patch }), false);
});
test("Lost create response reconciles persisted identity; retry 404 reuses identical immutable payload", async () => {
  const payload = {
    requestId: "stable",
    items: [{ productId: "p", quantity: 1 }],
    paymentMethod: "CASH",
  };
  const order = { id: "persisted" };
  const calls = [];
  const api = {
    createOrder: async (p) => {
      calls.push(["post", p]);
      throw new Error("socket lost");
    },
    getOrderByRequest: async (id) => {
      calls.push(["get", id]);
      return order;
    },
  };
  assert.equal(await helper.submitSalesOrder(api, payload, false), order);
  assert.deepEqual(calls, [
    ["post", payload],
    ["get", "stable"],
  ]);
  calls.length = 0;
  api.getOrderByRequest = async (id) => {
    calls.push(["get", id]);
    throw httpError(404);
  };
  api.createOrder = async (p) => {
    calls.push(["post", p]);
    return order;
  };
  assert.equal(await helper.submitSalesOrder(api, payload, true), order);
  assert.equal(calls[1][1], payload);
  assert.equal(payload.requestId, "stable");
  api.getOrderByRequest = async () => {
    throw httpError(500);
  };
  calls.length = 0;
  await assert.rejects(helper.submitSalesOrder(api, payload, true));
  assert.equal(calls.length, 0);
});
test("Order adapter sends version/idempotency/operation DTOs, unwraps envelopes, retains historical financial values", async () => {
  const calls = [];
  let value = {
    order: {
      id: "o",
      status: "PROCESSING",
      displayStatus: "CONFIRMED",
      version: 3,
      totalAmount: 40000,
      adjustmentTotal: -10000,
      adjustedPayable: 30000,
      additionalAmountDue: 0,
      refundDue: 10000,
      paymentStatus: "PAID",
      itemHistory: [{ id: "old", price: 40000, consumptionStatus: "VOIDED" }],
      items: [],
    },
  };
  const client = {
    get: async (...a) => {
      calls.push(["get", ...a]);
      return { data: { data: value } };
    },
    post: async (...a) => {
      calls.push(["post", ...a]);
      return { data: { data: value } };
    },
    patch: async (...a) => {
      calls.push(["patch", ...a]);
      return { data: { data: value } };
    },
  };
  const unwrap = (data, key) => data.data[key];
  const api = load("src/api/orders.api.ts", {
    "./client": {
      apiClient: client,
      unwrapApiField: unwrap,
      unwrapApiList: unwrap,
    },
    "../pages/admin/salesFeedback": helper,
  }).ordersApi;
  const order = await api.getOrderById("a/b");
  assert.equal(calls.at(-1)[1], "/orders/a%2Fb");
  assert.equal(order.itemHistory[0].price, 40000);
  assert.equal(order.refundDue, 10000);
  assert.equal(order.paymentStatus, "PAID");
  await api.updateOrderStatus("o", { status: "PREPARING", expectedVersion: 3 });
  assert.deepEqual(calls.at(-1), [
    "patch",
    "/orders/o/status",
    { status: "PREPARING", expectedVersion: 3 },
  ]);
  await api.getOrderByRequest("a/b");
  assert.equal(calls.at(-1)[1], "/orders/by-request/a%2Fb");
  const command = {
    requestId: "same",
    expectedVersion: 3,
    kind: "CANCEL",
    reason: "customer",
  };
  value = { operation: { id: "op", status: "REQUESTED", kind: "CANCEL" } };
  assert.equal((await api.requestOperation("o", command)).status, "REQUESTED");
  assert.equal(calls.at(-1)[2], command);
  value.operation.status = "APPLIED";
  await api.approveOperation("o", "op/a", 4);
  assert.deepEqual(calls.at(-1), [
    "post",
    "/orders/o/operations/op%2Fa/approve",
    { expectedVersion: 4 },
  ]);
  for (const kind of ["REMAKE", "CORRECTION"]) {
    await api.requestOperation("o", {
      ...command,
      kind,
      originalItemId: "original",
      ...(kind === "CORRECTION"
        ? { replacement: { productId: "new", quantity: 2 } }
        : {}),
    });
    assert.equal(calls.at(-1)[2].kind, kind);
  }
  await api.prepareItem("o", "i/a", { requestId: "prep", expectedVersion: 5 });
  assert.equal(calls.at(-1)[1], "/orders/o/items/i%2Fa/prepare");
  await api.editItems("o", {
    requestId: "edit",
    expectedVersion: 5,
    reason: "edit",
    items: [{ productId: "p", quantity: 2 }],
  });
  assert.equal(calls.at(-1)[0], "patch");
  value = { operation: { id: "op", status: "UNKNOWN" } };
  await assert.rejects(api.approveOperation("o", "op", 4));
  value = { order: {} };
  await assert.rejects(api.getOrderById("o"));
});
test("Feedback distinguishes version, request identity, payment reconciliation, stock, permission; never leaks diagnostics", () => {
  for (const [message, pattern] of [
    ["Order version changed", /Đơn đã thay đổi/],
    ["requestId payload or actor conflict", /Mã yêu cầu/],
    ["Reconcile existing payment before editing", /đối soát thanh toán/],
    ["Insufficient usable ingredient stock", /nguyên liệu/],
    ["Invalid status transition", /Trạng thái/],
  ])
    assert.match(helper.salesError(httpError(409, message)), pattern);
  for (const status of [400, 401, 403, 404, 409, 500])
    assert.ok(
      !helper
        .salesError(httpError(status, "PRIVATE SQL STACK"))
        .includes("PRIVATE"),
    );
});
function nodes(node) {
  return Array.isArray(node)
    ? node.flatMap(nodes)
    : node && typeof node === "object"
      ? [node, ...nodes(node.props?.children)]
      : [];
}
function harness(admin, api, order) {
  const slots = [];
  let cursor = 0;
  const messages = [];
  const react = {
    useState: (initial) => {
      const k = cursor++;
      if (!(k in slots)) slots[k] = initial;
      return [
        slots[k],
        (v) => {
          slots[k] = typeof v === "function" ? v(slots[k]) : v;
        },
      ];
    },
    useRef: (initial) => {
      const k = cursor++;
      return (slots[k] ??= { current: initial });
    },
    useEffect: () => {},
  };
  const Modal = () => null,
    Alert = () => null,
    SalesItemEditor = () => null;
  const component = load("src/pages/admin/SalesOperations.tsx", {
    react,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "../../api/orders.api": { ordersApi: api },
    "../../api/products.api": { productsApi: {} },
    "../../contexts/AuthContext": {
      useAuth: () => ({ isAdmin: admin, isStaff: !admin }),
    },
    "../../contexts/ToastContext": {
      useToast: () => ({
        success: (m) => messages.push(m),
        error: (m) => messages.push(m),
      }),
    },
    "../../components/common/Modal": { Modal },
    "../../components/common/Alert": { Alert },
    "../../utils/formatCurrency": { formatCurrency: String },
    "../../utils/formatDate": { formatDate: String },
    "./SalesCreateOrder": { SalesItemEditor },
    "./salesFeedback": helper,
  }).SalesOperations;
  const render = () => {
    cursor = 0;
    return nodes(
      component({ order, onRefresh: async () => {}, disabled: false }),
    );
  };
  const click = (label) =>
    render()
      .find((n) => n.type === "button" && n.props.children === label)
      .props.onClick();
  const field = (type, value) =>
    render()
      .find((n) => n.type === type)
      .props.onChange({ target: { value } });
  const check = () =>
    render()
      .find((n) => n.type === "input" && n.props.type === "checkbox")
      .props.onChange({ target: { checked: true } });
  const submit = () =>
    render()
      .find((n) => n.type === "form")
      .props.onSubmit({ preventDefault() {} });
  return { render, click, field, check, submit, messages, SalesItemEditor };
}
const prepared = {
  id: "o",
  status: "PREPARING",
  stockDeductedAt: "now",
  version: 3,
  items: [
    { id: "old", productId: "p", quantity: 1, consumptionStatus: "COMMITTED" },
  ],
  operations: [
    { id: "op", status: "REQUESTED", kind: "CANCEL", reason: "cancel" },
  ],
};
test('Detail presents frozen prices, VOIDED history, payment record and separate adjustment balances', () => {
  const row = {
    ...prepared, totalAmount: 40000, shippingFee: 0, adjustmentTotal: -10000,
    adjustedPayable: 30000, additionalAmountDue: 0, refundDue: 10000,
    paymentMethod: 'CASH', paymentStatus: 'PAID', createdAt: 'date',
    payment: {id:'pay',method:'CASH',status:'PAID',amount:40000},
    items: [{id:'active',productId:'p',productName:'Cà phê gốc',quantity:1,price:40000,recipeVersion:7,consumptionStatus:'COMMITTED'}],
    itemHistory: [{id:'historical',productId:'old-product',price:25000,quantity:1,consumptionStatus:'VOIDED',attemptType:'SALE'}],
  };
  const slots=[row,false,'',null,false,false];let cursor=0;
  const react={useState:()=>[slots[cursor++],()=>{}],useRef:()=>({current:false}),useEffect:()=>{}};
  const jsx=require('react/jsx-runtime');
  const component=load('src/pages/admin/AdminOrderDetailPage.tsx', {
    react,'react/jsx-runtime':jsx,'react-router-dom':{useParams:()=>({id:'o'}),Link:({children})=>jsx.jsx('a',{children})},
    '../../mock/config':{mockEnabled:false},'../../mock/MockWorkspace':{MockWorkspace:()=>null},
    '../../api/orders.api':{ordersApi:{}},'../../api/payments.api':{paymentsApi:{}},
    '../../contexts/AuthContext':{useAuth:()=>({isAdmin:true,isStaff:false})},
    '../../contexts/ToastContext':{useToast:()=>({})},
    '../../components/common/Alert':{Alert:({children})=>jsx.jsx('div',{children})},
    '../../components/common/Modal':{Modal:()=>null},'../../components/common/Loading':{Loading:()=>null},
    '../../utils/formatCurrency':{formatCurrency:v=>`${v} VND`},'../../utils/formatDate':{formatDate:String},
    '../../utils/payment':{getPaymentMethodLabel:String},'../../utils/shipping':{getZoneLabel:String},
    './salesFeedback':helper,'./SalesOperations':{SalesOperations:()=>null},'./sales.css':{},
  }).AdminOrderDetailPage;
  const html=require('react-dom/server').renderToStaticMarkup(require('react').createElement(component));
  for (const text of ['Cà phê gốc','40000 VND','25000 VND','30000 VND','10000 VND','Đã vô hiệu','Điều chỉnh không đồng nghĩa','Bắt đầu pha chế tiêu hao nguyên liệu']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('Xác nhận đã hoàn tiền mặt'), 'Paid CASH without REFUND_REQUIRED cannot be marked refunded');
});
test("STAFF requests cancellation without applying; ADMIN approval separate with version", async () => {
  const calls = [];
  const api = {
    requestOperation: async (...a) => {
      calls.push(a);
      return { id: "op", status: "REQUESTED" };
    },
    approveOperation: async (...a) => {
      calls.push(a);
      return { id: "op", status: "APPLIED" };
    },
  };
  const staff = harness(false, api, prepared);
  assert.ok(!staff.render().some((n) => n.props?.children === "Duyệt yêu cầu"));
  staff.click("Hủy đơn");
  staff.field("textarea", "Khách yêu cầu");
  await staff.submit();
  assert.equal(calls.length, 0);
  staff.check();
  await staff.submit();
  assert.equal(calls[0][1].expectedVersion, 3);
  assert.equal(calls[0][1].kind, "CANCEL");
  assert.match(staff.messages[0], /Chờ ADMIN/);
  const admin = harness(true, api, prepared);
  admin.click("Duyệt yêu cầu");
  admin.check();
  await admin.submit();
  assert.deepEqual(calls.at(-1), ["o", "op", 3]);
});
test("Remake/correction preserve original references; lost response retries exact intent; version conflicts never auto retry", async () => {
  for (const kind of ["REMAKE", "CORRECTION"]) {
    const calls = [];
    let fail = true;
    const api = {
      requestOperation: async (...args) => {
        calls.push(args);
        if (fail) throw new Error("network");
        return { id: "op", status: "REQUESTED" };
      },
    };
    const h = harness(false, api, prepared);
    h.click(helper.salesLabels[kind]);
    h.field("textarea", "Lỗi pha chế");
    h.field("select", "old");
    if (kind === "CORRECTION")
      h.render()
        .find((n) => n.type === h.SalesItemEditor)
        .props.onChange([{ productId: "new", quantity: 2 }]);
    h.check();
    await h.submit();
    fail = false;
    await h.submit();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0][1], calls[1][1]);
    assert.equal(calls[0][1].originalItemId, "old");
    assert.equal(calls[0][1].kind, kind);
  }
  let count = 0;
  const h = harness(
    false,
    {
      requestOperation: async () => {
        count++;
        throw httpError(409, "Order version changed");
      },
    },
    prepared,
  );
  h.click("Hủy đơn");
  h.field("textarea", "cancel");
  h.check();
  await h.submit();
  await h.submit();
  assert.equal(count, 1);
});
