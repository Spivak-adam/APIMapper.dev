import { Router, Request, Response } from "express";

const router = Router();

type User = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

const users: User[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    active: true,
  },
];

/**
 * GET /api/users
 * Tests query parameters, headers, and array responses.
 */
router.get("/api/users", (req: Request, res: Response) => {
  const search = String(req.query.search ?? "");
  const active = req.query.active === "true";
  const requestId = req.headers["x-request-id"];

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !search ||
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());

    const matchesActive = req.query.active === undefined || user.active === active;

    return matchesSearch && matchesActive;
  });

  return res.status(200).json({
    requestId,
    total: filteredUsers.length,
    users: filteredUsers,
  });
});

/**
 * GET /api/users/:userId
 * Tests path parameters and a not-found response.
 */
router.get("/api/users/:userId", (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = users.find((candidate) => candidate.id === userId);

  if (!user) {
    return res.status(404).json({
      error: "User not found",
      userId,
    });
  }

  return res.json(user);
});

/**
 * POST /api/users
 * Tests request body extraction.
 */
router.post("/api/users", (req: Request, res: Response) => {
  const { name, email, active = true } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "Name and email are required",
    });
  }

  const newUser: User = {
    id: String(users.length + 1),
    name,
    email,
    active,
  };

  users.push(newUser);

  return res.status(201).json({
    message: "User created",
    user: newUser,
  });
});

/**
 * PATCH /api/users/:userId/status
 * Tests mixed path and body inputs.
 */
router.patch("/api/users/:userId/status", (req: Request, res: Response) => {
  const { userId } = req.params;
  const { active } = req.body;

  const user = users.find((candidate) => candidate.id === userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.active = Boolean(active);

  return res.status(200).json({
    message: "User status updated",
    user,
  });
});

/**
 * DELETE /api/users/:userId
 * Tests a 204 response.
 */
router.delete("/api/users/:userId", (req: Request, res: Response) => {
  const { userId } = req.params;
  const userIndex = users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  users.splice(userIndex, 1);
  return res.status(204).send();
});

export default router;
