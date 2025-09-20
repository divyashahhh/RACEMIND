## RACEMIND - F1 RACE STRATEGY PREDICTOR
=====================================

A comprehensive Formula 1 race strategy prediction and analytics application
built with React Native and Expo, featuring mathematical strategy optimisation
and historical race data analysis.

## OVERVIEW
========

RaceMind is a mobile application that predicts optimal F1 race strategies using
mathematical models and historical data from OpenF1. The app combines heuristic
optimisation algorithms with real-time data integration to provide accurate
strategy recommendations for any F1 circuit.

## KEY FEATURES
============

1. STRATEGY PREDICTION
   - Mathematical strategy optimisation using tyre degradation models
   - Support for all F1 circuits with dynamic track data
   - Real-time pit stop and tyre compound recommendations
   - FIA rule compliance (minimum 2 different dry compounds)
   - Fallback data system for offline functionality

2. RACE ANALYTICS
   - Historical race data from OpenF1 API
   - Driver performance analysis and comparison
   - Interactive data tables with scrolling support
   - Year and track-based filtering
   - Real driver names and team information

3. DARK THEME UI
   - Professional F1-inspired dark aesthetic
   - High contrast colors for optimal readability
   - Custom tab navigation with icons
   - Responsive design for all iPhone screen sizes

## TECHNICAL ARCHITECTURE
======================

## FRONTEND
--------
- React Native with Expo framework
- TypeScript for type safety
- React Navigation for tab-based navigation
- Custom UI components with dark theme styling

## BACKEND INTEGRATION
-------------------
- OpenF1 API for real-time race data
- Fallback mock data system for offline functionality
- Mathematical strategy engine with optimisation algorithms
- Static track data for baseline calculations

## STRATEGY OPTIMIZATION
---------------------
The app uses a heuristic-based approach to find the minimum total race time:

1. Lap Time Modelling:
   Lap_Time = Base_Time + (Degradation_Rate × Lap_Number) + Fuel_Penalty

2. Tyre Degradation:
   - SOFT: 0.120-0.140 seconds/lap degradation
   - MEDIUM: 0.085-0.100 seconds/lap degradation
   - HARD: 0.060-0.075 seconds/lap degradation

3. Pit Stop Costs:
   - Circuit-specific time losses (18.5-22.5 seconds)
   - Dynamic calculation from OpenF1 data when available

4. Optimisation Algorithm:
   - Candidate generation for realistic stint combinations
   - Compound assignment following FIA rules
   - Early termination for performance optimisation

## PREREQUISITES
-------------
- Node.js (v16 or higher)
- npm or yarn package manager
- Expo CLI (install with: npm install -g @expo/cli)
- iPhone with Expo Go app (for testing)

## INSTALLATION STEPS
------------------
1. Clone the repository:
   git clone [repository-url]
   cd racemind

2. Install dependencies:
   npm install

3. Start the development server:
   npx expo start

4. Run on iPhone:
   - Install Expo Go from App Store
   - Scan QR code or enter URL from terminal
   - App will load on your device

## PROJECT STRUCTURE
=================

RaceMind/
├── App.tsx                 # Main application with tab navigation
├── StrategyEngine.ts       # Mathematical strategy optimisation
├── OpenF1.ts              # API integration and data fetching
├── assets/
│   ├── logo.png           # App icon and splash screen
│   ├── prediction.png     # Strategy tab icon
│   ├── analytics.png      # Analytics tab icon
│   └── data/
│       └── tracks.json    # Static track data
├── STRATEGY_MATH.txt      # Detailed mathematical documentation
├── README.txt             # This file
├── package.json           # Dependencies and scripts
└── app.json              # Expo configuration


## STRATEGY PREDICTION TAB
-----------------------
1. Select Track:
   - Choose from available circuit chips
   - Type custom track name for OpenF1 lookup
   - Track suggestions appear as you type

2. Set Parameters:
   - Enter race year (2020-2024)
   - Optional: Enter driver name
   - Optional: Set rain probability percentage

3. Predict Strategy:
   - Tap the "Predict strategy" button
   - View optimised strategy with:
     * Stint breakdown by lap numbers
     * Tyre compound recommendations
     * Total pit stops required
     * Estimated total race time

## ANALYTICS TAB
-------------
1. Select Filters:
   - Choose a year from 2020 to 2024 chips
   - Optionally filter by specific track
   - Tap "Search Race Data" to load data

2. View Results:
   - Scroll through the driver performance table
   - Compare total times, best laps, and pit stops
   - Data includes real driver names and teams

3. Data Sources:
   - Primary: OpenF1 API (when available)
   - Fallback: Realistic mock data (always works)

## FEATURES BREAKDOWN
==================

# STRATEGY ENGINE
---------------
- Mathematical optimisation using physics-based models
- Support for 1-4 pit stop strategies
- Tyre compound optimisation (SOFT/MEDIUM/HARD)
- Fuel load and degradation modelling
- Early termination for performance

# OPENF1 INTEGRATION
------------------
- Real-time race session data
- Driver and lap time information
- Pit loss calibration from historical data
- Degradation rate estimation
- Graceful fallback to mock data

# UI/UX FEATURES
--------------
- Dark theme with F1-inspired colours
- Custom tab navigation with icons
- Horizontal and vertical table scrolling
- High contrast text for readability
- Responsive design for all screen sizes
- Loading states and error handling

## MATHEMATICAL DOCUMENTATION
==========================

For detailed mathematical explanations, see STRATEGY_MATH.txt, which includes:
- Complete lap time modelling equations
- Tyre degradation calculations
- Pit stop optimisation algorithms
- OpenF1 data integration methods
- Performance optimisation techniques
- Accuracy limitations and future enhancements

FUTURE ENHANCEMENTS
===================

PLANNED FEATURES
----------------
- Current race year predictions
- Safety car period integration
- Real-time strategy updates, mid-game
- Machine learning predictions based on past years
- Advanced telemetry visualisation, race analytics
- Multi-race/driver comparison tools

TECHNICAL IMPROVEMENTS
----------------------
- Non-linear degradation modelling
- Driver-specific performance factors
- Dynamic fuel consumption
- Competitor strategy analysis
- Risk assessment algorithms

ACKNOWLEDGMENTS
===============

- OpenF1 API for providing real-time F1 data
- React Native and Expo communities
- F1 teams and drivers for inspiration
- Mathematical modelling research papers
- Open source contributors

---

RaceMind - Bringing F1 Race Strategy to Your Fingertips
Built with ❤️ for Formula 1 and a curiosity for predictions!


