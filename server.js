const express = require("express");
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Stripe = require("stripe");

const { User, RefreshToken } = require("./models");
const { authenticate } = require("./auth");

const app = express();

/* ---------------- CORS ---------------- */

app.use(
  cors({
    origin: [
      "http://pagination-frontend-bucket.s3-website.ap-south-1.amazonaws.com",
      "http://localhost:5173",
    ],
  })
);

/* ---------------- STRIPE ---------------- */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/* ---------------- WEBHOOK ---------------- */

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log("Webhook verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata.userId;

    await User.update({ role: "premium" }, { where: { id: userId } });

    console.log("User upgraded to premium!");
  }

  res.json({ received: true });
});

/* ---------------- JSON PARSER ---------------- */

app.use(express.json());

/* ---------------- TEST ROUTE ---------------- */

app.get("/welcome", (req, res) => {
  res.json({
    message: "Hello World. Welcome to coding",
  });
});

/* ---------------- GET USERS ---------------- */

app.get("/users", async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Database error" });
  }
});

/* ---------------- REGISTER ---------------- */

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered", user });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ---------------- PAGINATION ---------------- */

app.get("/pagination", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await User.findAndCountAll({
      limit,
      offset,
      order: [["id", "ASC"]],
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      data: rows,
      totalPages,
      totalRecords: count,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: "Database error" });
  }
});

/* ---------------- LOGIN ---------------- */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });

    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ accessToken, refreshToken });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ---------------- REFRESH TOKEN ---------------- */

app.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken)
    return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);

    const user = await User.findByPk(decoded.id);

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ accessToken });

  } catch (err) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
});

/* ---------------- LOGOUT ---------------- */

app.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  await RefreshToken.destroy({ where: { token: refreshToken } });

  res.json({ message: "Logged out" });
});

/* ---------------- STRIPE CHECKOUT ---------------- */

app.post("/create-checkout-session", authenticate, async (req, res) => {
  try {
    const { product } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: product.name,
            },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],

      mode: "payment",

      metadata: {
        userId: req.user.id,
      },

      success_url:
        "http://pagination-frontend-bucket.s3-website.ap-south-1.amazonaws.com/success",

      cancel_url:
        "http://pagination-frontend-bucket.s3-website.ap-south-1.amazonaws.com/cancel",
    });

    res.json({ id: session.id });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* ---------------- SERVER ---------------- */

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});