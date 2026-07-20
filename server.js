// server.js



const express = require("express");
require("dotenv").config();


console.log("SMTP HOST:", process.env.SMTP_HOST);
console.log("SMTP PORT:", process.env.SMTP_PORT);
console.log("SMTP USER EXISTS:", !!process.env.SMTP_USER);
console.log("SMTP PASS EXISTS:", !!process.env.SMTP_PASS);



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
    secure: false,

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },

    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
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

            from: '"B.M.TRAVELS" <b.meganathan2007@gmail.com>',

            to: email,

            subject: "Your B.M.TRAVELS verification code for signup",

            text: `
Your B.M.TRAVELS signup verification code is: ${otp}

This code will expire in 5 minutes.

If you did not request this code, you can safely ignore this email.

B.M.TRAVELS Team
            `,

            html: `
<!DOCTYPE html>
<html>

<body style="
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family: Arial, sans-serif;
">

    <div style="
        max-width: 600px;
        margin: 30px auto;
        background: #ffffff;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    ">

        <h2 style="color: #222;">
            B.M.TRAVELS
        </h2>

        <p style="font-size: 16px; color: #555;">
            You requested a signup verification code.
        </p>

        <p style="font-size: 16px; color: #555;">
            Your verification code is:
        </p>

        <div style="
            display: inline-block;
            margin: 20px 0;
            padding: 15px 30px;
            background: #f1f3f5;
            border-radius: 8px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #111;
        ">
            ${otp}
        </div>

        <p style="font-size: 14px; color: #777;">
            This code will expire in <b>5 minutes</b>.
        </p>

        <p style="font-size: 14px; color: #777;">
            If you did not request this code, you can safely ignore this email.
        </p>

        <hr style="
            border: none;
            border-top: 1px solid #eee;
            margin: 25px 0;
        ">

        <p style="font-size: 13px; color: #999;">
            Thank you,<br>
            <b>B.M.TRAVELS Team</b>
        </p>

    </div>

</body>

</html>
            `
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

            from: '"B.M.TRAVELS" <b.meganathan2007@gmail.com>',

            to: email,

            subject: "Your new B.M.TRAVELS verification code for signup",

            text: `
Your new B.M.TRAVELS signup verification code is: ${otp}

This code will expire in 5 minutes.

If you did not request this code, you can safely ignore this email.

B.M.TRAVELS Team
            `,

            html: `
<!DOCTYPE html>
<html>

<body style="
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family: Arial, sans-serif;
">

    <div style="
        max-width: 600px;
        margin: 30px auto;
        background: #ffffff;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    ">

        <h2 style="color: #222;">
            B.M.TRAVELS
        </h2>

        <p style="font-size: 16px; color: #555;">
            You requested a new signup verification code.
        </p>

        <p style="font-size: 16px; color: #555;">
            Your new verification code is:
        </p>

        <div style="
            display: inline-block;
            margin: 20px 0;
            padding: 15px 30px;
            background: #f1f3f5;
            border-radius: 8px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #111;
        ">
            ${otp}
        </div>

        <p style="font-size: 14px; color: #777;">
            This code will expire in <b>5 minutes</b>.
        </p>

        <p style="font-size: 14px; color: #777;">
            If you did not request this code, you can safely ignore this email.
        </p>

        <hr style="
            border: none;
            border-top: 1px solid #eee;
            margin: 25px 0;
        ">

        <p style="font-size: 13px; color: #999;">
            Thank you,<br>
            <b>B.M.TRAVELS Team</b>
        </p>

    </div>

</body>

</html>
            `
    
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

    aawait transporter.sendMail({

            from: '"B.M.TRAVELS" <b.meganathan2007@gmail.com>',

            to: email,

            subject: "Your B.M.TRAVELS verification code for login",

            text: `
Your B.M.TRAVELS login verification code is: ${otp}

This code will expire in 5 minutes.

If you did not request this code, you can safely ignore this email.

B.M.TRAVELS Team
            `,

            html: `
<!DOCTYPE html>
<html>

<body style="
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family: Arial, sans-serif;
">

    <div style="
        max-width: 600px;
        margin: 30px auto;
        background: #ffffff;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    ">

        <h2 style="color: #222;">
            B.M.TRAVELS
        </h2>

        <p style="font-size: 16px; color: #555;">
            You requested a login verification code.
        </p>

        <p style="font-size: 16px; color: #555;">
            Your verification code is:
        </p>

        <div style="
            display: inline-block;
            margin: 20px 0;
            padding: 15px 30px;
            background: #f1f3f5;
            border-radius: 8px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #111;
        ">
            ${otp}
        </div>

        <p style="font-size: 14px; color: #777;">
            This code will expire in <b>5 minutes</b>.
        </p>

        <p style="font-size: 14px; color: #777;">
            If you did not request this code, you can safely ignore this email.
        </p>

        <hr style="
            border: none;
            border-top: 1px solid #eee;
            margin: 25px 0;
        ">

        <p style="font-size: 13px; color: #999;">
            Thank you,<br>
            <b>B.M.TRAVELS Team</b>
        </p>

    </div>

</body>

</html>
            `
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

            from: '"B.M.TRAVELS" <b.meganathan2007@gmail.com>',

            to: email,

            subject: "Your new B.M.TRAVELS verification code for login",

            text: `
Your new B.M.TRAVELS login verification code is: ${otp}

This code will expire in 5 minutes.

If you did not request this code, you can safely ignore this email.

B.M.TRAVELS Team
            `,

            html: `
<!DOCTYPE html>
<html>

<body style="
    margin: 0;
    padding: 0;
    background: #f4f6f8;
    font-family: Arial, sans-serif;
">

    <div style="
        max-width: 600px;
        margin: 30px auto;
        background: #ffffff;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    ">

        <h2 style="color: #222;">
            B.M.TRAVELS
        </h2>

        <p style="font-size: 16px; color: #555;">
            You requested a new login verification code.
        </p>

        <p style="font-size: 16px; color: #555;">
            Your new verification code is:
        </p>

        <div style="
            display: inline-block;
            margin: 20px 0;
            padding: 15px 30px;
            background: #f1f3f5;
            border-radius: 8px;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #111;
        ">
            ${otp}
        </div>

        <p style="font-size: 14px; color: #777;">
            This code will expire in <b>5 minutes</b>.
        </p>

        <p style="font-size: 14px; color: #777;">
            If you did not request this code, you can safely ignore this email.
        </p>

        <hr style="
            border: none;
            border-top: 1px solid #eee;
            margin: 25px 0;
        ">

        <p style="font-size: 13px; color: #999;">
            Thank you,<br>
            <b>B.M.TRAVELS Team</b>
        </p>

    </div>

</body>

</html>
            `
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


app.get("/test-smtp", async (req, res) => {

    try {

        console.log("Testing SMTP connection...");

        await transporter.verify();

        console.log("SMTP connection successful");

        res.json({
            status: "success",
            message: "SMTP connection is working"
        });

    } catch (error) {

        console.error("SMTP VERIFY ERROR:", error);

        res.status(500).json({
            status: "error",
            message: error.message
        });

    }

});


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
