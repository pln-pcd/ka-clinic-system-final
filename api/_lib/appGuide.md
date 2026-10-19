# K&A Clinic Patient App Guide
Updated: October 2026

> Maintenance Note: When screens, button labels, navigation routes, or booking rules change in the patient app, update the facts in this document. KAI relies exclusively on this guide for facts about the app.

---

## 1. Overview & Identity
- App Name: K&A Clinic Patient App (or K&A Clinic).
- Purpose: A mobile patient application for patients of K&A Animal Bite Center & Clinic to view their official vaccination records, monitor dose schedules, export their vaccination card, book and manage weekend appointments, and communicate with the clinic.
- Users: Registered patients with a clinic Medical Record Number (MRN), and new visitors browsing in Guest Mode.
- KAI's Identity & Role: KAI is the K&A Clinic AI assistant. KAI helps patients understand and navigate the patient app. KAI is not a doctor, provides no medical advice or diagnoses, and only answers questions based on this guide.

---

## 2. Onboarding & Authentication

### Onboarding
- When the app is opened for the first time, four introductory slides are shown:
  1. Welcome to K&A Clinic (tracking animal bite recovery and vaccination progress).
  2. Live Vaccination Tracking (dose timelines, reminders, and alerts).
  3. Digital Vaccination Card (flipping and exporting the official immunization card).
  4. Weekend Appointment Booking (reserving weekend slots and tracking status).
- Buttons: "Skip" (goes directly to sign-in) or "Next" / "Get Started".

### Sign In
- Location: Sign In screen.
- Required credentials:
  1. Medical Record Number (MRN): Assigned by clinic staff upon intake (format: YYYY-NNN, e.g. 2026-001).
  2. Password: Created during patient account registration.
  3. "Keep me signed in" checkbox: Keeps the session active on trusted personal devices.
- Action button: "Sign In".
- Two-Factor / Device Verification:
  - If signing in on a new, untrusted device, the server sends a 6-digit One-Time Password (OTP) to the patient's registered email address.
  - The patient enters the 6-digit code on the "Verify Device" screen.
  - "Resend Code" is available after a 60-second cooldown if the email was delayed.
- Alternative links:
  - "Sign Up / Register": For patients who have an MRN but haven't created a login account yet.
  - "Forgot Password?": Sends a password reset email to the account's email address.
  - "Explore as Guest": Opens the app in read-only Guest Mode without an account.

---

## 3. Home Screen

The Home screen is the central dashboard for active immunization tracking.

### Header
- Greeting with patient's first name (or "Guest" in Guest mode).
- Active regimen banner displaying the active service protocol (e.g. "Post-Exposure ARV Protocol · 4-Dose Series").

### Vaccination Card
- Shows the digital replica of the clinic's physical vaccination card.
- Front Face:
  - Header: "K&A Animal Bite Center & Clinic" with official clinic logos.
  - Patient Information: Patient ID (MRN), Patient Name, Age, Sex, Date of Birth, and Address.
  - Exposure Details: Date of Exposure, Exposure Category (Category II or III), Biting Animal, and Anatomical Site.
  - Action buttons: "Tap to view back" and "Enlarge Card".
- Back Face:
  - Header: "Vaccination Record" with service protocol name.
  - Dose Table: 4 rows displaying Session/Dose label (e.g. "Session 1 (Day 0)"), Scheduled Date, Date Given, Vaccine Brand (e.g. Speeda, Verorab), Route/Site, and Staff Signature initials.
  - Action buttons: "Tap to view front" and "Enlarge Card".
- Enlarge Card & Export Modal:
  - Tapping "Enlarge Card" opens the card in a high-resolution, full-screen pop-up view.
  - Features an animated flip button to toggle between front and back.
  - "Export PNG" button: Renders and saves a crystal-clear image of the currently visible face directly to the device's photo gallery (requires photo library permission).

### Dose Timeline
- Located directly below the vaccination card.
- Displays each scheduled dose in chronological order.
- Each dose entry includes:
  - Dose / Session label (e.g. "Session 1 (Day 0)").
  - Target date.
  - Live status badge:
    - "Given": Marked completed by clinic staff with administration date.
    - "Due today": Scheduled for today's date.
    - "Overdue": Target date has passed without recorded administration.
    - "Upcoming": Future scheduled date.

### Previous Treatments Table
- Displayed on the Home screen only when a patient has completed earlier service regimens (from previous visits).
- Shows: Service name, Date started, Doses given, Completion date, and Status.
- Tapping any previous treatment row opens that specific past regimen's vaccination card in a modal with full export capability.

---

## 4. Appointments Screen

The Appointments screen is used to book weekend visits and track existing requests.

### Weekend Booking Rules
- The clinic accepts online appointment bookings only on Saturdays and Sundays.
- Weekdays (Monday through Friday) operate on a walk-in basis with no booking required.
- Operating hours for appointment slots: 8:00 AM to 5:00 PM in hourly blocks (8:00 AM - 9:00 AM, 9:00 AM - 10:00 AM, 10:00 AM - 11:00 AM, 11:00 AM - 12:00 PM, 1:00 PM - 2:00 PM, 2:00 PM - 3:00 PM, 3:00 PM - 4:00 PM, 4:00 PM - 5:00 PM).
- Lunch break: 12:00 PM to 1:00 PM (no slots available).
- Capacity: Exactly one patient per hourly slot. Slots already reserved are automatically blocked to prevent double-booking.

### Booking Workflow
1. Navigate to the "Appointments" tab.
2. In the interactive calendar, tap any highlighted Saturday or Sunday.
3. In the "Pick a Time Slot" modal, select an available hourly slot and tap "Next".
4. Review the Patient Details form (pre-filled with registered name, age, gender, contact number, and address).
5. Select the Appointment Type from the available clinic services.
6. (Optional) Enter "Patient Notes" for special requests or symptoms (up to 300 characters).
7. Tap "Request Appointment".

### Appointment Management & Lists
- My Appointments (Upcoming):
  - Grouped list of active upcoming appointments.
  - Statuses:
    - "Pending": Awaiting clinic staff review.
    - "Confirmed" / "Accepted": Approved by clinic staff.
    - "Cancellation requested": Patient submitted a cancellation request awaiting confirmation.
  - Tapping any appointment opens its detailed summary card.
  - "Cancel" button: Available for pending and confirmed visits. Prompts for an optional cancellation reason before submitting the cancellation request.
- Past Appointments:
  - Grouped list of attended visits marked "Done".
- Cancelled:
  - Grouped list of cancelled visits, including clinic decline reasons if rejected by the clinic.

---

## 5. Chat Screen (KAI & Staff Escalation)

The Chat screen provides automated assistance and direct communication with clinic personnel.

### Chat with KAI
- Automated assistant for navigating the app, finding features, understanding booking steps, and viewing service descriptions.
- KAI does not provide medical consultations or diagnose health conditions.

### Talk to Clinic Staff
- Tapping the "Talk to clinic staff" button escalates the chat directly to clinic nurses and administrative staff.
- A confirmation prompt warns the patient that staff respond during clinic operating hours.
- While in a staff conversation, patient messages are routed to the clinic dashboard.
- Staff replies appear with clinic staff badges.
- Tapping "End Conversation" returns the chat to KAI.

---

## 6. Records Screen

The Records screen provides a detailed clinical summary of the patient's current registration:
- Case Status: Active regimen status (e.g. "Ongoing" or "Completed").
- Exposure Summary (for PEP patients):
  - Biting / Scratching Animal (e.g. Dog, Cat).
  - Exposure Category (Category II or Category III).
  - Date of Incident and Anatomical Wound Location.
- Regimen Details: Protocol name, total doses, vaccine brands administered, and administration history.

---

## 7. Account (Profile) Screen

The Account screen manages the patient's personal settings, security, and preferences.

### Profile Header & Stats
- Profile Photo:
  - Tapping the avatar allows the patient to "Take Photo", "Choose from Library", or "Remove Photo".
  - Photos are compressed and synced with the clinic record.
- Three Key Stats:
  1. "Service": Shows the current active service abbreviation (e.g. PEP, PrEP, Anti-Tetanus, Pneumonia, Booster). If all services are completed, shows the most recent service. Shows "—" if no record or in Guest mode.
  2. "Doses": Ratio of completed doses to total protocol doses (e.g. "2/4"). Shows "—" in Guest mode.
  3. "Next Dose": Date of the next upcoming dose, "Done" if all doses are complete, or "—" in Guest mode.

### Menu Sections
- Personal Information:
  - View full name, MRN, date of birth, sex, contact number, home address, and emergency contact.
  - Tapping "Edit Details" allows updating contact number, address, and emergency details.
- Push Notifications:
  - Toggle switch to enable or disable push notifications on the device.
  - Sends immediate local test confirmation upon activation.
  - Note: Push notifications require a registered patient account; unavailable in Guest mode.
- Logged-in Devices:
  - Lists all active phone and web sessions authenticated with the patient's MRN.
  - Displays device platform, model name, and last active timestamp.
  - "Sign Out" button next to any remote device terminates that session.
  - "Sign Out All Other Devices" button disconnects all sessions except the current phone.
- Privacy Policy:
  - Displays clinic data collection practices, encryption standards (AES-256), patient data rights, and Data Privacy Officer contact (privacy@kavaccineclinic.ph).
- Sign Out:
  - Securely logs out of the current device, clears session credentials, and redirects to the Sign In screen.

---

## 8. Guest Mode

- Purpose: Allows prospective patients or family members to explore the app interface before registering.
- Safeguards & Restrictions:
  - Shows no private patient records or personal health information.
  - Profile card stats display "—".
  - Vaccination card shows dummy sample information and cannot be exported.
  - Booking appointments is blocked (prompts user to sign in or register).
  - Push notifications cannot be toggled on.
  - Profile details cannot be edited.

---

## 9. Official Clinic Services

The clinic offers the following vaccination and clinical services:
1. Post-Exposure Prophylaxis (PEP):
   - For individuals with animal bites or scratches.
   - Standard 4-session regimen: Day 0, Day 3, Day 7, Day 28.
2. Pre-Exposure Prophylaxis (PrEP):
   - Preventive immunization for high-risk individuals (animal handlers, veterinarians).
   - Standard 2-dose series: Day 0, Day 7.
3. Anti-Tetanus Prophylaxis:
   - For wound injuries or completing tetanus immunization.
   - Standard 3-dose protocol: 0, 1 month, 6 months.
4. Pneumococcal Vaccine (Pneumonia):
   - Single-dose protection for older adults and high-risk patients.
5. Rabies Booster Dose:
   - For previously vaccinated patients presenting with a new exposure.

---

## 10. Clinic Basics (as shown in App)
- Office Hours:
  - Monday to Friday: 8:00 AM to 5:00 PM (Walk-in, no appointment required).
  - Saturday and Sunday: 8:00 AM to 5:00 PM (By appointment via the Appointments tab).
  - Daily lunch break: 12:00 PM to 1:00 PM.
- Privacy & Support Email: privacy@kavaccineclinic.ph (listed in Account → Privacy Policy).
- In-App Support: Patients can tap "Talk to clinic staff" in the Chat tab during clinic hours to converse directly with clinic personnel.
