// server.js



const express = require("express");
require("dotenv").config();
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors({
    origin: "https://meganathan16.github.io",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));
app.use(bodyParser.json());

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

// Brevo SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),

  secure: Number(process.env.SMTP_PORT) === 465,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// Temporary storage for OTP verification
let pendingSignups = {}; // { email: { name, password, otp } }
let pendingLogins = {};  // { email: { otp } }

// ===== SIGNUP =====
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    await connection.end();

    if (rows.length > 0)
      return res.status(400).json({ message: "Account already exists!" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Store in pendingSignups
    pendingSignups[email] = {
    name,
    password,
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
};

    // Send OTP via Brevo
    await transporter.sendMail({
      from: '"My App" <b.meganathan2007@gmail.com>',
      to: email,
      subject: "Signup OTP Verification",
      text: `Your OTP is ${otp}`,
      html: `<h1>Your OTP is: <b>${otp}</b></h1>`
    });

    res.json({
      message: "OTP sent! Please verify to complete signup."
    });

  } catch (err) {
  console.error(err);
  res.status(500).json({
    message: err.message
  });
}
});

// ===== VERIFY SIGNUP OTP =====
app.post("/verify-signup-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const pending = pendingSignups[email];

    if (!pending)
      return res.status(400).json({
        message: "No pending signup found."
      });
	  
	if (Date.now() > pending.expiresAt) {
    return res.status(400).json({
        message: "OTP expired. Click 'Resend OTP' to receive a new one."
    });
}

    if (pending.otp !== Number(otp))
      return res.status(400).json({
        message: "Invalid OTP."
      });

    const connection = await mysql.createConnection(dbConfig);

    // Hash password before saving
const hashedPassword = await bcrypt.hash(pending.password, 10);

await connection.execute(
  "INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, ?)",
  [pending.name, email, hashedPassword, 1]
);

    await connection.end();

    delete pendingSignups[email];

    res.json({
      message: "Signup verified! You can now login."
    });

  } catch (err) {
    res.status(500).json({
      message: "Error: " + err.message
    });
  }
});

// ===== SIGNUP RESEND OTP =====
app.post("/resend-signup-otp", async (req, res) => {

    const { email } = req.body;

    const pending = pendingSignups[email];

    if (!pending) {
        return res.status(400).json({
            message: "Signup session not found."
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    pending.otp = otp;
    pending.expiresAt = Date.now() + 5 * 60 * 1000;

    try {

        await transporter.sendMail({
            from: '"My App" <b.meganathan2007@gmail.com>',
            to: email,
            subject: "Signup OTP Verification",
            html: `<h1>Your new Signup OTP is: <b>${otp}</b></h1>`
        });

        res.json({
            message: "New OTP sent successfully."
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }

});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    await connection.end();

    if (rows.length === 0)
      return res.status(400).json({
        message: "No account found."
      });

    const user = rows[0];

    // Compare entered password with hashed password
const passwordMatch = await bcrypt.compare(password, user.password);

if (!passwordMatch) {
    return res.status(400).json({
        message: "Incorrect password."
    });
}

    const otp = Math.floor(100000 + Math.random() * 900000);

    pendingLogins[email] = {
    otp,
    expiresAt: Date.now() + 1 * 60 * 1000 // 5 minutes
};

    await transporter.sendMail({
      from: '"My App" <b.meganathan2007@gmail.com>',
      to: email,
      subject: "Login OTP Verification",
      text: `Your login OTP is ${otp}`,
      html: `<h1>Your login OTP is: <b>${otp}</b></h1>`
    });

    res.json({
      message: "OTP sent! Please verify to login."
    });

  } catch (err) {
    res.status(500).json({
      message: "Error: " + err.message
    });
  }
});

// ===== VERIFY LOGIN OTP =====
app.post("/verify-login-otp", (req, res) => {
  const { email, otp } = req.body;

  const pending = pendingLogins[email];

  if (!pending)
    return res.status(400).json({
      message: "No pending login found."
    });
	
  if (Date.now() > pending.expiresAt) {
    return res.status(400).json({
        message: "OTP expired. Click 'Resend OTP' to receive a new one."
    });
}

  if (pending.otp !== Number(otp))
    return res.status(400).json({
      message: "Invalid OTP."
    });

  delete pendingLogins[email];

  res.json({
    message: "Login successful! Redirecting..."
  });
});

// ===== LOGIN OTP RESEND =====
app.post("/resend-login-otp", async (req, res) => {

    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            message: "Email is required."
        });
    }

    // Generate a NEW OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Create a new login session if it doesn't exist,
    // or overwrite the old one.
    pendingLogins[email] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
    };

    try {

        await transporter.sendMail({
            from: '"My App" <b.meganathan2007@gmail.com>',
            to: email,
            subject: "Login OTP Verification",
            html: `<h1>Your new Login OTP is: <b>${otp}</b></h1>`
        });

        res.json({
            message: "New OTP sent successfully."
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }

});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;

app.get("/test-email", async (req, res) => {

  try {

    console.log("📧 Testing SMTP connection...");

    await transporter.sendMail({

      from: '"My App" <b.meganathan2007@gmail.com>',

      to: "b.meganathan2007@gmail.com",

      subject: "SMTP Test",

      text: "SMTP is working successfully!"

    });

    console.log("✅ Test email sent successfully");

    res.json({
      status: "success",
      message: "Test email sent successfully!"
    });

  } catch (error) {

    console.error("❌ SMTP ERROR:", error);

    res.status(500).json({
      status: "error",
      message: error.message
    });

  }

});


app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "Backend is running successfully!"
    });
});

(async () => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        console.log("✅ Database connected successfully");
        await connection.end();
    } catch (err) {
        console.error("❌ Database connection failed:", err.message);
    }
})();
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
