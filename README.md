# 🏫 EduCore — Advanced School Management System

A full-stack school management platform built with **React.js**, **Node.js**, **Express**, and **MongoDB**.

## Features
- 🔐 JWT Authentication with 8 role types
- 👤 Student & Teacher Management (CRUD)
- ✓ Daily Attendance Tracking
- 📝 Exams & Auto-graded Results
- 💰 Fee Collection & Receipts
- 📚 Library Book Issue/Return
- 🚌 Transport Route Management
- 🔔 School Announcements
- 📋 Assignments & Submissions
- 🗓 Class Timetable
- 📊 Role-based Dashboard

## Quick Start

```bash
# Terminal 1 — Backend
cd backend && npm install
cp .env.example .env   # Fill in your MongoDB URI + secrets
node utils/seedData.js # Create test accounts
npm run dev            # Starts on port 5000

# Terminal 2 — Frontend
cd frontend && npm install
npm start              # Starts on port 3000
```

Open http://localhost:3000 and login with `admin@school.com` / `Admin@123`

## Full Setup Guide
See **SETUP_GUIDE.md** for complete step-by-step instructions including MongoDB Atlas setup, environment variables, and deployment.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, React Router v6, Axios
- **Backend**: Node.js, Express.js, JWT, bcryptjs
- **Database**: MongoDB, Mongoose
- **Deployment**: Render (backend) + Vercel (frontend)
