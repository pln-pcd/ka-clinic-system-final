# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Primary:** Clinic staff, nurses, and administrators using the Admin Dashboard to manage patient records, administer anti-rabies PEP/PrEP vaccine doses, monitor inventory, schedule appointments, and coordinate bite incident responses.
- **Secondary:** Patients and animal bite victims using the Mobile App and Landing Page to track dose timelines, view appointment schedules, report bite incidents, consult clinic staff, and access post-exposure guidance.

## Product Purpose

Provide an end-to-end anti-rabies vaccination and animal bite care management platform. The platform ensures strict adherence to post-exposure prophylaxis (PEP) vaccine dose schedules (e.g. Day 0, Day 3, Day 7, Day 14/28), reduces patient drop-off, streamlines clinic operations, and provides real-time tracking for rabies exposure risks.

## Positioning

Specialized anti-rabies and animal bite clinic ecosystem combining high-compliance dose schedule tracking, bite incident reporting, and inventory control tailored specifically to Rabies Post-Exposure Prophylaxis (PEP) clinical protocols and patient follow-up.

## Operating Context

- **Clinical Environment:** Fast-paced vaccination clinics handling emergency animal bite walk-ins, scheduled dose follow-ups, vaccine cold-chain inventory (Rabies vaccines, RIG/ERIG/HRIG immunoglobulins), and patient communications.
- **Mobile / On-the-Go Context:** Bite victims needing immediate triage guidance, incident reporting, dose reminders, and appointment scheduling.

## Capabilities and Constraints

- **Admin Dashboard:** Patient management, dose tracking & completion badges, appointment scheduling, bite incident reports, inventory tracking (vials, doses, syringes), direct patient messaging, analytics, and clinic settings.
- **Patient Mobile App:** Dose schedule timeline/reminders, appointment booking & status, bite incident submission, direct chat/consultation, and educational rabies care resources.
- **Landing Page:** Public clinic services overview, location/contact info, online appointment request, and animal bite first-aid protocols.
- **Technical Constraints:** Multi-app workspace (`ka-clinic-admin` React/Vite, `landing` React/Vite, `patient-app` React Native/Expo). Firebase/Firestore integration.

## Brand Commitments

- **Name:** K&A Clinic (K&A Anti-Rabies Vaccination Clinic / K&A Animal Bite Center).
- **Tone & Voice:** Professional, reassuring, urgent, and clinical.
- **Primary Theme / Accent:** Medical red (`#E31837`), clinical whites, sleek dark navigation, high-contrast healthcare UI.

## Evidence on Hand

- `ka-clinic-admin`: Fully featured React/Vite admin app with Firestore integration, component modules (`patients.jsx`, `vaccination.jsx`, `incidents.jsx`, `inventory.jsx`, `messages.jsx`, `appts.jsx`, `settings.jsx`).
- `landing`: Public React/Vite landing page (`LandingPage.jsx`).
- `patient-app`: Expo/React Native mobile app for patients (`app/`, `components/`, `sharedData.js`).
- Logos and branding assets (`logo-white-nobg.png`).

## Product Principles

1. **Protocol-First Precision:** Rabies PEP dose schedules are non-negotiable; missing a dose carries critical risk. UI must prominently highlight upcoming and overdue doses.
2. **Speed in Emergency:** Animal bite incidents require rapid triage and action; reporting and appointment flows must be frictionless.
3. **Clarity and Assurance:** Medical information and status badges must be unambiguous to both clinic nurses and anxious patients.
4. **Seamless Continuity:** Sync status and patient context seamlessly between the mobile app, landing page, and admin dashboard.

## Accessibility & Inclusion

- Clear visual contrast for healthcare environments (high-contrast status badges: Completed, Pending, Overdue, Active).
- Accessible typography and touch targets across web and native mobile interfaces.
