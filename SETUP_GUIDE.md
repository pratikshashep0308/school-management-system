# 🏫 EduCore — Complete Setup Guide for Beginners

## What You're Building
A full-stack School Management System with:
- **Backend**: Node.js + Express API running on port 5000
- **Frontend**: React.js app running on port 3000
- **Database**: MongoDB (free cloud database)

---

## STEP 1 — Install Required Software

### A) Node.js
1. Go to https://nodejs.org
2. Download the **LTS version** (e.g., 20.x.x)
3. Run the installer, keep all defaults, click Next → Install
4. Verify installation by opening a terminal and typing:
```
node --version    → Should show v20.x.x
npm --version     → Should show 10.x.x
```

### B) MongoDB Atlas (Free Cloud Database)
1. Go to https://www.mongodb.com/atlas and click **Try Free**
2. Create a free account
3. Click **Build a Database** → Choose **FREE (M0)** tier → Click Create
4. Set username: `schooladmin` and password: `School2024`
5. Click **Create User**
6. Under "Where would you like to connect from?" → click **Add My Current IP Address**
7. Click **Finish and Close**
8. In the left menu, click **Database** → **Connect** → **Drivers**
9. Copy the connection string — it looks like:
   `mongodb+srv://schooladmin:<password>@cluster0.xxxxx.mongodb.net/`
10. Replace `<password>` with `School2024`

### C) VS Code
1. Go to https://code.visualstudio.com and download it
2. Install these extensions (Ctrl+Shift+X → search each):
   - **ESLint** by Microsoft
   - **Prettier** by Prettier
   - **ES7+ React Snippets** by dsznajder
   - **Tailwind CSS IntelliSense** by Tailwind Labs

---

## STEP 2 — Open the Project in VS Code

1. Extract the downloaded ZIP to a folder, e.g.:
   - Windows: `C:\Users\YourName\projects\school-management-system`
   - Mac: `/Users/YourName/projects/school-management-system`
2. Open VS Code
3. File → **Open Folder** → select the `school-management-system` folder
4. You should see two folders in the sidebar: `backend/` and `frontend/`

---

## STEP 3 — Set Up Environment Variables

### Backend .env file
1. In VS Code, navigate to the `backend/` folder
2. You'll see a file called `.env.example`
3. **Copy** that file and rename the copy to `.env` (no extension)
4. Open `backend/.env` and fill in your values:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://schooladmin:School2024@cluster0.xxxxx.mongodb.net/school_management?retryWrites=true&w=majority
JWT_SECRET=mySchoolManagementSecretKey2024SuperLongRandom
JWT_EXPIRE=30d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=your-gmail-app-password
FRONTEND_URL=http://localhost:3000
```

> ⚠️ **Replace the MONGO_URI** with YOUR actual connection string from MongoDB Atlas!

### Frontend .env file
The `frontend/.env` file is already created with the correct default values.
You don't need to change it for local development.

---

## STEP 4 — Open TWO Terminals in VS Code

In VS Code:
1. Press **Ctrl+` ** (backtick) to open the first terminal
2. Click the **+** icon in the terminal panel to open a second terminal
3. You'll see two tabs at the bottom — one for backend, one for frontend

---

## STEP 5 — Install Backend Dependencies

**In Terminal 1 (Backend):**

```bash
cd backend
npm install
```

Wait for it to finish. You'll see a `node_modules` folder appear.

---

## STEP 6 — Seed the Database with Test Data

Still in Terminal 1:

```bash
node utils/seedData.js
```

You should see:
```
✅ Connected to MongoDB
🏫 Creating school...
👤 Creating users...
📚 Creating subjects...
🎓 Creating teachers...
...
✅ Database seeded successfully!

Test Accounts:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
School Admin : admin@school.com / Admin@123
Teacher      : teacher@school.com / Teacher@123
Student      : student@school.com / Student@123
...
```

---

## STEP 7 — Start the Backend Server

Still in Terminal 1:

```bash
npm run dev
```

You should see:
```
✅ MongoDB Connected
🚀 Server running on port 5000 in development mode
```

**Test it:** Open your browser and go to http://localhost:5000/api/health
You should see: `{"status":"OK","message":"School Management System API is running"}`

---

## STEP 8 — Install Frontend Dependencies

**In Terminal 2 (Frontend):**

```bash
cd frontend
npm install
```

This takes 3-5 minutes. Wait for it to complete.

---

## STEP 9 — Start the React Frontend

Still in Terminal 2:

```bash
npm start
```

Your browser should automatically open to http://localhost:3000

If not, open it manually.

---

## STEP 10 — Log In and Test!

Use any of these test accounts:

| Role         | Email                       | Password    |
|--------------|-----------------------------|-------------|
| School Admin | admin@school.com            | Admin@123   |
| Teacher      | teacher@school.com          | Teacher@123 |
| Student      | student@school.com          | Student@123 |
| Parent       | parent@school.com           | Parent@123  |
| Accountant   | accountant@school.com       | Admin@123   |
| Super Admin  | superadmin@school.com       | Admin@123   |

---

## Common Errors & How to Fix Them

### ❌ "Cannot connect to MongoDB"
**Cause**: Wrong connection string or IP not whitelisted
**Fix**:
1. Check your `MONGO_URI` in `backend/.env`
2. In MongoDB Atlas → Network Access → Add IP Address → Allow Access From Anywhere (0.0.0.0/0)
3. Make sure you replaced `<password>` in the connection string

### ❌ "npm install" fails
**Fix**:
```bash
npm cache clean --force
npm install
```

### ❌ "Port 5000 already in use"
**Fix (Windows)**:
```bash
netstat -ano | findstr :5000
taskkill /PID <NUMBER_YOU_SEE> /F
```
**Fix (Mac/Linux)**:
```bash
lsof -ti :5000 | xargs kill -9
```

### ❌ "Port 3000 already in use"
**Fix**: Press `Y` when React asks "Would you like to run on port 3001?" OR:
```bash
# Mac/Linux:
lsof -ti :3000 | xargs kill -9
npm start
```

### ❌ React shows blank white screen
**Fix**:
1. Press F12 → Console tab → Read the error
2. Make sure backend is running (check Terminal 1)
3. Check that `frontend/.env` has `REACT_APP_API_URL=http://localhost:5000/api`

### ❌ "Module not found" errors
**Fix**: Make sure you installed dependencies in BOTH folders:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### ❌ Login says "Invalid credentials"
**Fix**: Re-run the seed script to recreate test accounts:
```bash
cd backend
node utils/seedData.js
```

### ❌ CORS error in browser console
**Fix**: Make sure in `backend/.env`:
```
FRONTEND_URL=http://localhost:3000
```
Then restart the backend server (Ctrl+C → npm run dev)

---

## Project Structure Explained

```
school-management-system/
│
├── backend/                    ← Node.js + Express API
│   ├── config/
│   │   └── db.js               ← MongoDB connection
│   ├── controllers/
│   │   ├── authController.js   ← Login, logout, password reset
│   │   ├── studentController.js
│   │   ├── attendanceController.js
│   │   └── dashboardController.js
│   ├── middleware/
│   │   ├── auth.js             ← JWT verification
│   │   └── errorHandler.js     ← Global error handling
│   ├── models/
│   │   ├── User.js             ← User with roles
│   │   ├── Student.js          ← Student profile
│   │   ├── Teacher.js          ← Teacher profile
│   │   └── index.js            ← All other models
│   ├── routes/                 ← API endpoints
│   ├── utils/
│   │   └── seedData.js         ← Test data generator
│   ├── .env                    ← ⚠️ Secret config (DON'T commit!)
│   ├── .env.example            ← Template for .env
│   ├── package.json
│   └── server.js               ← App entry point
│
├── frontend/                   ← React.js app
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Layout.js   ← Sidebar + topbar wrapper
│   │   │   │   └── Sidebar.js  ← Navigation
│   │   │   └── ui/
│   │   │       └── index.js    ← Reusable components
│   │   ├── context/
│   │   │   └── AuthContext.js  ← Global auth state
│   │   ├── pages/              ← One file per page
│   │   │   ├── Login.js
│   │   │   ├── Dashboard.js
│   │   │   ├── Students.js
│   │   │   ├── Teachers.js
│   │   │   ├── Classes.js
│   │   │   ├── Attendance.js
│   │   │   ├── Exams.js
│   │   │   ├── Fees.js
│   │   │   ├── Timetable.js
│   │   │   ├── Assignments.js
│   │   │   ├── Library.js
│   │   │   ├── Transport.js
│   │   │   └── Notifications.js
│   │   ├── utils/
│   │   │   └── api.js          ← All API calls (Axios)
│   │   ├── App.js              ← Routes
│   │   ├── index.js            ← Entry point
│   │   └── index.css           ← Tailwind + custom styles
│   ├── .env                    ← Frontend env vars
│   ├── package.json
│   └── tailwind.config.js
│
└── SETUP_GUIDE.md              ← This file!
```

---

## How the Code Works

### Authentication Flow
1. User enters email + password on login page
2. React sends `POST /api/auth/login` to Express backend
3. Backend checks credentials against MongoDB
4. If valid → backend returns a **JWT token**
5. React stores token in `localStorage`
6. Every API request includes `Authorization: Bearer <token>` header
7. Backend middleware verifies the token on protected routes

### Role-Based Access Control
- Each user has a `role` field: `superAdmin`, `schoolAdmin`, `teacher`, `student`, `parent`, etc.
- Backend: `authorize('superAdmin', 'schoolAdmin')` middleware blocks unauthorized roles
- Frontend: `can(['superAdmin', 'schoolAdmin'])` helper hides UI elements by role
- Sidebar automatically shows/hides menu items based on role

### Adding a New Feature (Example: Events Module)
**Backend (3 steps):**
1. Create `backend/models/Event.js` — define MongoDB schema
2. Create `backend/routes/eventRoutes.js` — define API endpoints
3. Register in `server.js`: `app.use('/api/events', require('./routes/eventRoutes'))`

**Frontend (3 steps):**
1. Create `frontend/src/pages/Events.js` — build the React page
2. Add API functions in `frontend/src/utils/api.js`
3. Add route in `App.js` and menu item in `Sidebar.js`

---

## Deployment

### Deploy Backend to Render (Free)
1. Push your code to GitHub (create a repo at github.com)
2. Go to https://render.com → Sign Up → **New Web Service**
3. Connect GitHub → select your repo
4. Settings:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add all environment variables from your `.env` file
6. Click **Create Web Service**
7. Copy your Render URL (e.g., `https://educore-api.onrender.com`)

### Deploy Frontend to Vercel (Free)
1. Go to https://vercel.com → Sign Up with GitHub
2. **Add New Project** → Import your GitHub repo
3. Settings:
   - Root Directory: `frontend`
   - Framework: Create React App
4. Add environment variable:
   - `REACT_APP_API_URL` = `https://your-backend.onrender.com/api`
5. Click **Deploy**
6. Your app is live! 🎉

---

## Technology Stack Summary

| Layer        | Technology              | Why We Use It                         |
|-------------|-------------------------|---------------------------------------|
| Frontend    | React.js 18             | Component-based UI, fast rendering    |
| Styling     | Tailwind CSS            | Utility classes, no custom CSS mess   |
| HTTP Client | Axios                   | Promise-based API calls               |
| Routing     | React Router v6         | Client-side page navigation           |
| Backend     | Node.js + Express       | Fast, lightweight REST API            |
| Database    | MongoDB + Mongoose      | Flexible document store               |
| Auth        | JWT + bcryptjs          | Secure, stateless authentication      |
| Toasts      | react-hot-toast         | Beautiful notification popups         |
| Deployment  | Render + Vercel         | Free cloud hosting                    |

---

## Quick Reference Commands

```bash
# ── BACKEND ──
cd backend
npm install           # Install packages
npm run dev           # Start dev server (auto-restarts)
npm start             # Start production server
node utils/seedData.js  # Seed test data

# ── FRONTEND ──
cd frontend
npm install           # Install packages
npm start             # Start dev server at localhost:3000
npm run build         # Build for production

# ── BOTH (run simultaneously in separate terminals) ──
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd frontend && npm start
```

---

*EduCore School Management System — Built with React + Node.js + MongoDB*
*For questions or issues, check the error guide above first!*
