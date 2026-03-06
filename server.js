const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
app.use(cors());
const { User } = require("./models");
const {authenticate} = require("./auth");
console.log("authenticate type:", typeof authenticate);
const bcrypt = require("bcrypt");
const Stripe = require("stripe");
const ACCESS_SECRET = process.env.ACCESS_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret =
  "whsec_2fc2aba001c5960a7de8d5f7bae53bae4dbaa7552c5492b49df2caa8ed94aa7f";

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const userId = session.metadata.userId;

    await User.update({ role: "premium" }, { where: { id: userId } });

    console.log("User upgraded to premium!");
  }

  res.json({ received: true });
});

app.use(express.json());

app.get("/welcome", (req, res) => {
  res.status(200).json({
    message: "Hello World. welcome to coding",
  });
});
app.get("/users", async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Database error" });
  }
});

app.post("/register", async (req, res) => {
  try {
    console.log("Request body:", req.body);

    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered", user });
  } catch (error) {
    console.error("FULL ERROR:", error); // 👈 VERY IMPORTANT
    res.status(500).json({ error: error.message });
  }
});


app.get("/pagination", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await User.findAndCountAll({
      limit,
      offset,
      order: [["id", "ASC"]], // good practice
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

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

   const accessToken = jwt.sign(
  { id: user.id, role: user.role },
  process.env.ACCESS_SECRET,
  { expiresIn: "15m" }
);

    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, {
      expiresIn: "7d",
    });

    res.json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
});

app.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken)
    return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

    const user = await User.findByPk(decoded.id);

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ accessToken });

  } catch (err) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
});

app.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  await RefreshToken.destroy({ where: { token: refreshToken } });

  res.json({ message: "Logged out" });
});

app.post("/create-checkout-session", authenticate,async (req, res) => {
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
        userId: req.user.id, // 🔥 IMPORTANT
      },

      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/cancel",
    });

    res.json({ id: session.id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});



app.listen(3000, () => {
  console.log("connected successfully to port 3000");
});