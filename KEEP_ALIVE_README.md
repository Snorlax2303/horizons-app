# Supabase Keep-Alive Service

## Overview
Supabase free tier projects are paused automatically after periods of inactivity to save resources. This Keep-Alive Service ensures your Supabase database remains active by periodically executing a very lightweight query from the frontend application, simulating active usage. 

By default, the service runs a low-impact `count` query against the `profiles` table every 5 days.

## How It Works
- **Service (`SupabaseKeepAliveService.js`)**: Manages the interval timers, executes the actual database ping, handles exponential backoff retries, and notifies subscribers of state changes. It operates as a singleton to prevent overlapping intervals.
- **Logger (`SupabaseKeepAliveLogger.js`)**: Keeps track of ping history, successes, and errors in `localStorage` for debugging purposes without cluttering your main application state.
- **Hook (`useSupabaseKeepAlive.js`)**: Provides a React interface to access the service's current state and methods.
- **Context (`KeepAliveContext.jsx`)**: Instantiates the hook globally at the root level (`App.jsx`), ensuring the timer starts automatically when a user opens the application.
- **Monitor (`KeepAliveMonitor.jsx`)**: A small UI indicator that shows connection health, allows manual pings, and displays logs.

## Configuration Options

Configuration is managed in `src/utils/KeepAliveConfig.js`.