import express, { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: "customer" | "admin";
  };
}

type OrderItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  customerId: string;
  status: "pending" | "paid" | "shipped" | "cancelled";
  items: OrderItem[];
};

const orders: Order[] = [];

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Missing or invalid bearer token",
    });
    return;
  }

  req.user = {
    id: "demo-user",
    role: "customer",
  };

  next();
}

/**
 * POST /api/orders
 * Tests middleware, auth headers, nested body arrays, and created responses.
 */
app.post(
  "/api/orders",
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { items } = req.body as { items?: OrderItem[] };
    const idempotencyKey = req.get("Idempotency-Key");

    if (!items?.length) {
      return res.status(400).json({
        error: "At least one order item is required",
      });
    }

    const order: Order = {
      id: crypto.randomUUID(),
      customerId: req.user!.id,
      status: "pending",
      items,
    };

    orders.push(order);

    return res.status(201).json({
      idempotencyKey,
      order,
    });
  },
);

/**
 * GET /api/orders/:orderId
 * Tests route parameters and authenticated request data.
 */
app.get(
  "/api/orders/:orderId",
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const orderId = req.params.orderId;
    const includeItems = req.query.includeItems !== "false";

    const order = orders.find((candidate) => candidate.id === orderId);

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
        orderId,
      });
    }

    return res.status(200).json({
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      items: includeItems ? order.items : undefined,
    });
  },
);

/**
 * PUT /api/orders/:orderId/status
 * Tests path parameters, body values, and role-sensitive behavior.
 */
app.put(
  "/api/orders/:orderId/status",
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const { status } = req.body as {
      status?: Order["status"];
    };

    const allowedStatuses: Order["status"][] = [
      "pending",
      "paid",
      "shipped",
      "cancelled",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid order status",
        allowedStatuses,
      });
    }

    const order = orders.find((candidate) => candidate.id === orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    order.status = status;

    return res.json({
      message: "Order status updated",
      order,
    });
  },
);

/**
 * GET /api/customers/:customerId/orders
 * Tests multiple filters, pagination, and custom response headers.
 */
app.get(
  "/api/customers/:customerId/orders",
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { customerId } = req.params;
    const status = req.query.status as Order["status"] | undefined;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    const matchingOrders = orders.filter((order) => {
      const matchesCustomer = order.customerId === customerId;
      const matchesStatus = !status || order.status === status;
      return matchesCustomer && matchesStatus;
    });

    const start = (page - 1) * limit;
    const paginatedOrders = matchingOrders.slice(start, start + limit);

    res.setHeader("X-Total-Count", String(matchingOrders.length));

    return res.status(200).json({
      page,
      limit,
      orders: paginatedOrders,
    });
  },
);

export default app;
