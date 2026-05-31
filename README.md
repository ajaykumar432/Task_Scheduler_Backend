# ScoreMe MSME Pipeline Scheduler

Full-stack web application for the **ScoreMe Engineering Capstone Assignment** — scheduling MSME credit pipeline tasks across processing slots with conflict, resource, and SLA constraints.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Backend   | Node.js · Express.js · MongoDB    |
| Frontend  | React 18 · Tailwind CSS · Vite    |
| State     | Zustand · TanStack Query          |
| Charts    | Recharts                          |
| Auth      | JWT (bcryptjs)                    |

---

## Project Structure

```
scoreme-scheduler/
├── backend/
│   └── src/
│       ├── config/          # MongoDB connection
│       ├── controllers/     # authController, instanceController,
│       │                    # schedulerController, benchmarkController
│       ├── middleware/       # auth.js, errorHandler.js
│       ├── models/          # User, Task, Instance, Schedule, Benchmark
│       ├── routes/          # authRoutes, instanceRoutes, schedulerRoutes,
│       │                    # taskRoutes, benchmarkRoutes
│       ├── utils/           # instanceGenerator.js, scheduler.js
│       ├── app.js
│       └── server.js
│
└── frontend/
    └── src/
        ├── api/             # axios.js, services.js
        ├── components/
        │   └── common/      # Layout, ProtectedRoute, UI (shared components)
        ├── pages/           # LoginPage, RegisterPage, DashboardPage,
        │                    # InstancesPage, InstanceDetailPage,
        │                    # SchedulerPage, BenchmarksPage
        ├── store/           # authStore.js (Zustand + persist)
        ├── App.jsx
        ├── main.jsx
        └── index.css
```

---

## Setup & Run

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017 (or provide URI)

### 1. Install dependencies

```bash
# From project root
npm run install:all
```

### 2. Configure environment backend

```bash
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=""

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d

# CORS
CLIENT_URL=http://localhost:5176
```

### 3. Run in development

```bash
# From project root — starts both backend (5000) and frontend (5173)
npm run dev
```

Or separately:
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

---

## API Endpoints

### Auth
| Method | Endpoint           | Description         |
|--------|--------------------|---------------------|
| POST   | /api/auth/register | Register new user   |
| POST   | /api/auth/login    | Login               |
| GET    | /api/auth/me       | Get current user    |

### Instances
| Method | Endpoint                   | Description              |
|--------|----------------------------|--------------------------|
| GET    | /api/instances             | List all instances       |
| POST   | /api/instances/generate    | Auto-generate instance   |
| GET    | /api/instances/:id         | Get instance detail      |
| DELETE | /api/instances/:id         | Delete instance          |

### Scheduler
| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| POST   | /api/scheduler/run            | Run scheduling algorithm |
| GET    | /api/scheduler/history/:id    | Schedule history         |
| GET    | /api/scheduler/stats/overview | Aggregate stats          |

### Benchmarks
| Method | Endpoint              | Description                |
|--------|-----------------------|----------------------------|
| POST   | /api/benchmarks/run   | Run all 9 benchmark cases  |
| GET    | /api/benchmarks       | List benchmark runs        |
| GET    | /api/benchmarks/:id   | Get benchmark detail       |

---

## Scheduling Algorithms

| Algorithm            | Description                                    | Best For            |
|----------------------|------------------------------------------------|---------------------|
| Priority Greedy      | Sort by weight, assign first valid slot        | Speed, baseline     |
| DSATUR Variant       | Max-saturation coloring + resource check       | Conflict-heavy      |
| Simulated Annealing  | Probabilistic local search, cooling schedule   | Best quality        |
| Tabu Search          | Deterministic local search, tabu list          | Consistent quality  |

---

## Penalty Function

```
P(σ) = Σ w(i)×slot(i)                         [delay — P_base]
     + 0.3 × (max_cpu_load − min_cpu_load)      [load imbalance]
     + 0.5 × Σ w(i)×(slot(i)/upper_window(i))  [SLA proximity risk]
     + 0.2 × #partially-filled-GPU-slots        [GPU fragmentation]
```

---

## Pages

- **Dashboard** — Stats overview, algorithm usage chart, recent instances
- **Instances** — List, generate (with the official generator), delete
- **Instance Detail** — Slot capacities, run any algorithm, view history
- **Scheduler** — Full scheduling UI with penalty breakdown and slot utilization charts
- **Benchmarks** — Run the official 9-instance suite, penalty vs n / runtime vs n charts

