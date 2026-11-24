
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.get("/", (req, res) => {
  res.json({
    app: "Chat Now",
    status: "Backend Running"
  });
});

// SIGN UP
app.post("/api/signup", async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    if (!username || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: "Invalid username"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters"
      });
    }

    const cleanPhone = phone.replace(/\s/g, "");

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .or(`username.ilike.${username},phone.eq.${cleanPhone}`)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username or phone already registered"
      });
    }

    const { data, error } = await authClient.auth.signUp({
      phone: cleanPhone,
      password: password,
      options: {
        data: {
          username: username
        }
      }
    });

    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: data.user.id,
          username: username,
          phone: cleanPhone
        });

      if (profileError) {
        await supabase.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
    }

    res.json({
      success: true,
      message: "Signup successful",
      user: data.user,
      session: data.session
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// LOGIN WITH PHONE OR USERNAME
app.post("/api/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        message: "Login and password required"
      });
    }

    let phone = login.trim();

    if (!phone.startsWith("+")) {
      const { data, error } = await supabase
        .from("profiles")
        .select("phone")
        .ilike("username", phone)
        .maybeSingle();

      if (error || !data) {
        return res.status(401).json({
          success: false,
          message: "Invalid username or password"
        });
      }

      phone = data.phone;
    }

    const { data, error } =
      await authClient.auth.signInWithPassword({
        phone: phone,
        password: password
      });

    if (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/phone or password"
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      user: data.user,
      session: data.session
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// LOGOUT
app.post("/api/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token required"
      });
    }

    const { error } = await authClient.auth.admin.signOut(token);

    if (error) throw error;

    res.json({
      success: true,
      message: "Logged out"
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Chat Now server running on " + PORT);
});
