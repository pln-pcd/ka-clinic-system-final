# K&A Clinic System Documentation

## K&A Clinic Admin Web Dashboard

![Figure 1 : Clinic Staff Portal & Admin Authentication Screen](screenshots/admin_login_page.png)

**Figure 1 : Clinic Staff Portal & Admin Authentication Screen**

This illustrates the Clinic Staff Portal & Admin Authentication Screen of the K&A Clinic Admin Dashboard, which serves as the primary security perimeter and access control checkpoint for clinic personnel. The form includes inputs for registered clinic Email and Password with visibility toggling, a "Remember me" option that binds an authorized 30-day device trust token, an inline "Forgot Password?" recovery link, and a high-contrast navy "Login" button.

---

![Figure 2 : Clinical Operations Overview & KPI Executive Dashboard](screenshots/admin_dashboard_overview.png)

**Figure 2 : Clinical Operations Overview & KPI Executive Dashboard**

Figure 2 illustrates the Clinical Operations Overview & KPI Executive Dashboard of the K&A Clinic Admin Portal, which serves as the primary operational command center for clinic administrators and nurses. Anchored by a fixed navy sidebar navigation menu on the left, the main workspace opens with a personalized greeting ("Hello, Admin! Your trusted partner in rabies prevention and clinical care") and real-time operational status. Four key performance metric cards summarize critical daily clinic indicators: Total Active Patients, Pending Doses Scheduled for Today, Overdue Immunization Alerts, and Low-Stock Vaccine Vials. Below the summary cards, three synchronized monitoring panels display "Urgent Action Required" (listing patients with overdue doses requiring immediate phone or SMS recall), "Today's Scheduled Inoculations" (displaying dose times, patient names, and vaccine routes), and "Live Vaccine Inventory Status" (visualizing vials remaining of Speeda, Verorab, and Rabies Immunoglobulin). Tapping any panel's "View all" button navigates directly to the corresponding module, enabling staff to prioritize emergency clinical interventions.

---

![Figure 3 : Patient Records & Clinical Registration Management](screenshots/admin_patient_records.png)

**Figure 3 : Patient Records & Clinical Registration Management**

Figure 3 illustrates the Patient Records & Clinical Registration Management interface of the K&A Clinic Admin Dashboard, which serves as the centralized digital repository for all patient charts and electronic medical histories. The header provides search inputs by Patient Name, Medical Record Number (MRN), or Contact Number, alongside filters for Exposure Category (Cat I, Cat II, Cat III) and Treatment Status (Active, Completed, Overdue). A prominent "Register New Patient" button opens the full intake modal to log demographic information, exposure dates, biting animal details, wound anatomical sites, and allergy notes. The core data table displays patient MRNs, full names, assigned treatment protocols, latest dose completion statuses, attending nurse initials, and action buttons. Clicking any patient row opens the comprehensive Patient Dossier modal, where staff can review digital vaccination card details, print duplicate immunization certificates, update clinical observations, or generate official medical certificates.

---

![Figure 4 : Post-Exposure Prophylaxis (PEP) Vaccine Dose Tracker](screenshots/admin_vaccination_tracker.png)

**Figure 4 : Post-Exposure Prophylaxis (PEP) Vaccine Dose Tracker**

Figure 4 illustrates the Post-Exposure Prophylaxis (PEP) Vaccine Dose Tracker of the K&A Clinic Admin Dashboard, which serves as the core clinical protocol enforcement engine. Built to adhere strictly to the World Health Organization (WHO) and Philippine Department of Health (DOH) rabies prophylaxis guidelines, this screen tracks patients across multi-dose Essen and Zagreb schedules (Day 0, Day 3, Day 7, Day 14/28). The interface is arranged into categorized progress columns and table views indicating "Due Today", "Upcoming This Week", "Completed", and "Overdue/Missed". Each patient record showcases circular progress completion rings, precise dose numbers, target calendar dates, administering nurse initials, vaccine brand names (e.g., Verorab, Speeda), lot numbers, and injection anatomical routes (Intramuscular into deltoid or 2-site Intradermal). Nurses can click "Administer Dose" to open the batch deduction modal, record vial batch numbers, and automatically notify the patient's mobile app.

---

![Figure 5 : Clinic Appointments Management & Weekend Scheduling Hub](screenshots/admin_appointments.png)

**Figure 5 : Clinic Appointments Management & Weekend Scheduling Hub**

Figure 5 illustrates the Clinic Appointments Management & Weekend Scheduling Hub of the K&A Clinic Admin Dashboard, which serves as the scheduling coordinator and calendar management center. Designed around clinic operational policies where formal appointments are scheduled on Saturdays and Sundays while weekdays remain dedicated to emergency walk-in bite victims, the interface provides both an interactive monthly calendar view and a daily slot breakdown list. Each appointment card presents the patient's name, contact telephone, selected one-hour time window (between 8:00 AM and 5:00 PM), requested service type (PEP Dose, PrEP, Booster, or Consultation), and appointment status badges ("Pending", "Confirmed", "Done", "Cancelled"). Staff can approve requested bookings, assign consultation rooms, process rescheduling requests, or initiate walk-in appointments. Double-booking prevention algorithms automatically lock slots across both the web portal and patient mobile app.

---

![Figure 6 : Geographic Animal Bite Incident Map & Triage Severity Registry](screenshots/admin_incident_map.png)

**Figure 6 : Geographic Animal Bite Incident Map & Triage Severity Registry**

Figure 6 illustrates the Geographic Animal Bite Incident Map & Triage Severity Registry of the K&A Clinic Admin Dashboard, which serves as the epidemiological surveillance and geographic intelligence workstation. The screen integrates an interactive mapping engine displaying the geographic coordinates of reported bite and scratch incidents across Libon, Albay, and neighboring municipalities. Pin markers are color-coded by clinical severity: Red markers denote Category III exposures (transdermal bites or scratches, licks on broken skin, or exposure to bats); Amber markers denote Category II exposures (minor scratches without bleeding); and Blue markers denote Category I exposures. Clicking any geographic marker summons an incident drawer displaying exposure date, biting animal species (canine, feline, wildlife), animal rabies vaccination status, observation status (alive, dead, sacrificed), and linked patient MRN, empowering public health administrators to detect regional outbreak clusters.

---

![Figure 7 : Vaccine & Medical Supply Inventory Control System](screenshots/admin_inventory.png)

**Figure 7 : Vaccine & Medical Supply Inventory Control System**

Figure 7 illustrates the Vaccine & Medical Supply Inventory Control System of the K&A Clinic Admin Dashboard, which serves as the cold-chain pharmaceuticals monitor and clinical stock manager. The top dashboard highlights summary metrics: Total Doses On Hand, Vials Expiring Within 30 Days, Critical Stock Reorder Alerts, and Syringes/Consumables. The main inventory table lists each pharmaceutical item (PVRV Rabies Vaccine, PCECV Vaccine, Rabies Immunoglobulin ERIG/HRIG, Anti-Tetanus Serum, Syringes) alongside manufacturer lot numbers, expiration dates, vial volumes (mL), remaining doses per vial, and cold-chain storage temperature logs (2°C - 8°C). Interactive buttons allow authorized clinic pharmacists to perform "Stock In" for incoming deliveries, "Record Spoilage/Wastage", and adjust minimum threshold reorder warnings. When nurses log administered doses in the Vaccination Tracker, vial deductions automatically decrement from this ledger in real time.

---

![Figure 8 : Direct Patient Teleconsultation & Live Messaging Portal](screenshots/admin_messages.png)

**Figure 8 : Direct Patient Teleconsultation & Live Messaging Portal**

Figure 8 illustrates the Direct Patient Teleconsultation & Live Messaging Portal of the K&A Clinic Admin Dashboard, which serves as the two-way communications channel between clinic nursing staff and registered patients. The left sidebar displays an active thread inbox categorized into "Needs Nurse Triage", "Active Inquiries", and "Resolved Consultations", with timestamp badges and unread indicator counters. Selecting a conversation loads the central chat history, showcasing automated conversational turns conducted by KAI (the clinic AI triage bot) alongside live human replies. When KAI detects symptoms requiring clinical intervention, the thread is escalated to this portal with urgent visual highlighting. Clinic nurses can type direct responses, attach clinical instruction files, schedule follow-up appointments, or mark consultations as resolved, maintaining patient follow-up without requiring in-person travel.

---

![Figure 9 : Clinic Settings, Security Auditing, and System Backups](screenshots/admin_settings.png)

**Figure 9 : Clinic Settings, Security Auditing, and System Backups**

Figure 9 illustrates the Clinic Settings, Security Auditing, and System Backups interface of the K&A Clinic Admin Dashboard, which serves as the system configuration console and compliance administration terminal. The interface is partitioned into clean settings sections: Clinic Profile (updating clinic operating name, ABTC registration numbers, physical facility address, public hotlines), Staff & User Management (managing staff accounts, assigning Role-Based Access Control privileges such as Administrator, Medical Doctor, or Staff Nurse, and issuing email invite tokens), System Notification Parameters (configuring automated SMS and push dose reminders), Security Audit Trail (displaying a tamper-evident audit log of patient chart edits and dose records with staff timestamps), and Data Backup & Archive Tools allowing encrypted Firestore database exports.

---

## K&A Clinic Patient Mobile App

![Figure 10 : Patient Onboarding & Rabies PEP Clinical Instructions](screenshots/mobile_onboarding_1.png)

**Figure 10 : Patient Onboarding & Rabies PEP Clinical Instructions**

Figure 10 illustrates the Patient Onboarding & Rabies PEP Clinical Instructions screen of the K&A Clinic Patient Mobile App, which serves as the instructional orientation sequence for new patients. Structured with a clean smartphone layout, the upper viewport showcases tailored medical vector artwork representing post-exposure vaccine scheduling, while the lower viewport consists of an elevated clinical card. The interface educates patients on the life-critical importance of adhering strictly to rabies post-exposure prophylaxis dose timelines (Day 0, Day 3, Day 7, Day 28), explaining how doses are programmatically mapped from exposure dates. An animated progress dot indicator highlights Step 1 of the orientation, and an emphasis linear gradient navy button ("Next") facilitates forward progression.

---

![Figure 11 : Patient Orientation Protocol & Get Started Milestone](screenshots/mobile_onboarding_4.png)

**Figure 11 : Patient Orientation Protocol & Get Started Milestone**

Figure 11 illustrates the Patient Orientation Protocol & Get Started Milestone screen of the K&A Clinic Patient Mobile App, which serves as the final step of the instructional onboarding sequence. The screen highlights clinic appointment access ("ACCESS: APPOINTMENT BOOKING / Book Appointments From Your Phone"), explaining how patients can reserve weekend slots directly from their phones with automatic conflict blocking to avoid double bookings. A prominent "Get Started" rocket button records onboarding completion in device preferences and smoothly routes the patient to the authentication portal.

---

![Figure 12 : Patient Authentication & Two-Factor OTP Sign-In Portal](screenshots/mobile_login.png)

**Figure 12 : Patient Authentication & Two-Factor OTP Sign-In Portal**

Figure 12 illustrates the Patient Authentication & Two-Factor OTP Sign-In Portal of the K&A Clinic Patient Mobile App, which serves as the identity authentication gateway safeguarding electronic medical records. Patients enter their unique Medical Record Number (MRN) and account password, with options to toggle password visibility, check "Keep me signed in" for trusted personal devices, and recover forgotten passwords. Submitting credentials dispatches a 6-digit numeric one-time passcode (OTP) to the patient's registered email address for two-factor verification. First-time bite victims can tap "Sign up" to register their hospital chart, while general community visitors can tap "Continue as a Guest" for immediate triage and guidance.

---

![Figure 13 : Patient Home Dashboard & Active Immunization Overview](screenshots/mobile_home_dashboard.png)

**Figure 13 : Patient Home Dashboard & Active Immunization Overview**

Figure 13 illustrates the Patient Home Dashboard & Active Immunization Overview of the K&A Clinic Patient Mobile App, which serves as the primary home screen and daily health command center. The top mesh section presents a deep Navy Blue header (#1E3A8A to #0F172A) greeting the patient by name alongside an interactive notification bell with unread alert dotting. Immediately below sits the high-contrast Next Dose Protocol Card, prominently displaying the patient's immunization progress (e.g., "2/4 Doses Completed"), upcoming session title, target administration date with clock icon, and a navigation chevron to view the full timeline. Further down the scrollable canvas rests the interactive Digital Vaccination Card, case details table, and recent clinic announcements, ensuring critical treatment deadlines are immediately visible.

---

![Figure 14 : Digital Interactive Vaccination Record Card (Certificate Face)](screenshots/mobile_vaccination_card.png)

**Figure 14 : Digital Interactive Vaccination Record Card (Certificate Face)**

Figure 14 illustrates the Digital Interactive Vaccination Record Card (Certificate Face) of the K&A Clinic Patient Mobile App, which serves as the patient's official legal electronic immunization credential. Displayed in an authentic clinical ratio with realistic rounded corners and drop shadows, the card presents the patient full name, Medical Record Number (MRN), vaccination route (Intramuscular/Intradermal), and an authentic tabular dose grid listing scheduled doses (Dose 1 / Day 0 through Dose 4 / Day 28), administration dates, vaccine brand names (e.g., Verorab, Speeda, Rabipur), batch/lot numbers, and nurse signatures. A validation QR code allows instant clinic scanner authentication. Tapping the card activates a realistic 450ms 3D flip animation.

---

![Figure 15 : Exposure Details & Clinical Treatments (Reverse Card Face)](screenshots/mobile_vaccination_card_back.png)

**Figure 15 : Exposure Details & Clinical Treatments (Reverse Card Face)**

Figure 15 illustrates the Exposure Details & Clinical Treatments (Reverse Card Face) of the K&A Clinic Patient Mobile App, which serves as the epidemiological and clinical documentation side of the digital vaccination card. This reverse view documents critical epidemiological details including Bite/Exposure Date, Exposure Category (Category I, II, or III), Biting Animal Species (Canine, Feline, Stray/Domestic), Animal Observation Status, Wound Location, Rabies Immunoglobulin (RIG) / Anti-Tetanus administration records, and attending clinic stamp. Directly beneath the card, patients can tap the "Showing Back · Tap to Flip" hint or tap the "Enlarge Card" button to open an edge-to-edge lightbox with a "Save to Gallery" function.

---

![Figure 16 : PEP Dose Protocol Timeline & Progress Inspector Modal](screenshots/mobile_dose_protocol_modal.png)

**Figure 16 : PEP Dose Protocol Timeline & Progress Inspector Modal**

Figure 16 illustrates the PEP Dose Protocol Timeline & Progress Inspector Modal of the K&A Clinic Patient Mobile App, which serves as the comprehensive dose compliance dialog. Accessed by tapping the Next Dose banner on the Home Dashboard, the modal presents an overlay displaying the active regimen (e.g., "Post-Exposure Prophylaxis · Modified Essen Protocol") and percentage of completed immunization. A vertical timeline lane displays individual dose milestones (Dose 1 / Day 0 through Dose 4 / Day 28) with status iconography: completed doses show green checkmarks, pending upcoming doses show blue clock badges, and missed or overdue doses are highlighted with urgent warning indicators. Clinical notes remind the patient that adherence prevents rabies encephalitis and doses must be verified by clinic nurses.

---

![Figure 17 : Appointments Calendar & Weekend Clinical Slot Selector](screenshots/mobile_appointments_calendar.png)

**Figure 17 : Appointments Calendar & Weekend Clinical Slot Selector**

Figure 17 illustrates the Appointments Calendar & Weekend Clinical Slot Selector of the K&A Clinic Patient Mobile App, which serves as the self-service appointment scheduling terminal. Located under the Appointments tab, an interactive monthly calendar highlights available weekend clinic days (Saturdays and Sundays) with high-contrast red numerals while weekdays remain denoted for emergency walk-ins. Below the calendar, active appointments appear with color-coded status badges ("Confirmed", "Pending", "Done", "Cancelled"). Tapping an open weekend date on the calendar immediately summons the Available Time Slots picker.

---

![Figure 18 : Available Time Slots Picker (Saturday & Sunday Operating Windows)](screenshots/mobile_appointment_time_slots.png)

**Figure 18 : Available Time Slots Picker (Saturday & Sunday Operating Windows)**

Figure 18 illustrates the Available Time Slots Picker (Saturday & Sunday Operating Windows) of the K&A Clinic Patient Mobile App, which serves as the hourly slot selection modal. Appearing as an elevated dialog over the dimmed calendar view, the header indicates "Pick a Time Slot" and displays the selected date (e.g., "Saturday, October 17, 2026"). The 2-column balanced time grid displays hourly windows from 8:00 AM - 9:00 AM through 4:00 PM - 5:00 PM. Booked slots are crossed out with a "Full" badge and disabled from selection, preventing double bookings. Selecting an open slot highlights it in deep navy, updates the bottom summary, and enables the "Next" action button.

---

![Figure 19 : Appointment Patient Details & Service Booking Form](screenshots/mobile_appointment_details_form.png)

**Figure 19 : Appointment Patient Details & Service Booking Form**

Figure 19 illustrates the Appointment Patient Details & Service Booking Form of the K&A Clinic Patient Mobile App, which serves as the booking intake form after setting the appointment time. The modal header confirms the selected date and time slot. The form provides a Service Type dropdown (Post-Exposure Prophylaxis Dose, Pre-Exposure Prophylaxis, Booster Dose, or Consultation), patient full name, age, gender selector, physical address, and contact telephone number. An optional Clinical Notes text area allows patients to communicate symptoms, wound pain, or exposure observations to clinic nurses prior to arrival. Tapping "Request Appointment" submits the booking for administrative approval.

---

![Figure 20 : Appointment Confirmation & Clinic Arrival Protocol Dialog](screenshots/mobile_appointment_confirmed.png)

**Figure 20 : Appointment Confirmation & Clinic Arrival Protocol Dialog**

Figure 20 illustrates the Appointment Confirmation & Clinic Arrival Protocol Dialog of the K&A Clinic Patient Mobile App, which serves as the completion receipt following successful appointment reservation. The modal features an emerald circular checkmark badge with the bold title "Appointment Requested!". It presents a clean summary card displaying the booked Date, Time Window, Attending Center ("K&A Animal Bite Center - Libon, Albay"), and Service Category. Important clinic arrival guidelines advise patients to bring valid identification and their physical vaccination booklet. Tapping "Got it!" dismisses the modal and updates the appointments list.

---

![Figure 21 : KAI Medical AI Triage Assistant & Clinical Guidance Hub](screenshots/mobile_kai_chat.png)

**Figure 21 : KAI Medical AI Triage Assistant & Clinical Guidance Hub**

Figure 21 illustrates the KAI Medical AI Triage Assistant & Clinical Guidance Hub of the K&A Clinic Patient Mobile App, which serves as the real-time AI teleconsultation terminal. Under the Chat tab, patients interact with KAI, an AI triage assistant pre-configured with clinical safety rules and quick-inquiry suggestion chips ("Clinic hours?", "How do I book an appointment?", "Where is the clinic?", "How do I use this app?"). The chat viewport displays timestamps, avatar badges, and rich formatted text bubbles. The bottom text composer allows typing free-form inquiries with keyboard-compensated elevation.

---

![Figure 22 : KAI Intelligent Advisory & Staff Escalation Response](screenshots/mobile_kai_chat_response.png)

**Figure 22 : KAI Intelligent Advisory & Staff Escalation Response**

Figure 22 illustrates the KAI Intelligent Advisory & Staff Escalation Response of the K&A Clinic Patient Mobile App, which serves as the medical safety response and nurse handoff mechanism. When patients report acute bite symptoms, active bleeding, or medication queries, KAI displays an official medical refusal disclaimer emphasizing that the AI does not prescribe treatments. In the same turn, KAI offers safe first-aid wound cleansing steps and presents an immediate "Connect to Clinic Staff" button. Tapping this button transitions the thread into Live Staff Mode, connecting the patient directly with on-duty clinic nurses.

---

![Figure 23 : Official Medical History & Exposure Case Log Archive](screenshots/mobile_records.png)

**Figure 23 : Official Medical History & Exposure Case Log Archive**

Figure 23 illustrates the Official Medical History & Exposure Case Log Archive of the K&A Clinic Patient Mobile App, which serves as the patient's permanent epidemiological and clinical records repository. Accessible via the Records tab, the view provides comprehensive tabular breakdowns of the initial animal bite encounter: Exposure Date, Severity Category, Biting Animal Species (e.g., Canine, Domestic Stray), Anatomical Bite Site, Category III Treatments administered (Rabies Immunoglobulin / Anti-Tetanus Serum), and attending ABTC credentials. Below the case records, the full vaccination schedule table lists all administered and pending doses.

---

![Figure 24 : Patient Account Settings, Notification Toggles & Profile Controls](screenshots/mobile_app_settings.png)

**Figure 24 : Patient Account Settings, Notification Toggles & Profile Controls**

Figure 24 illustrates the Patient Account Settings, Notification Toggles & Profile Controls screen of the K&A Clinic Patient Mobile App, which serves as the user's profile repository and application configuration center. Located under the Account tab, the screen features the patient's profile photo with camera upload options, full name, and Medical Record Number badge. Configurable items include Personal Information (vital metrics and emergency phone numbers), Push Notification toggles for dose reminders, and a Logged-in Devices terminal showing active phone models and sessions with a "Revoke Other Sessions" button. A secure Sign Out action allows patients to clear device sessions safely.

---

![Figure 25 : Demographic Vital Metrics & Emergency Contacts Management](screenshots/mobile_personal_info.png)

**Figure 25 : Demographic Vital Metrics & Emergency Contacts Management**

Figure 25 illustrates the Demographic Vital Metrics & Emergency Contacts Management screen of the K&A Clinic Patient Mobile App, which serves as the detailed patient health profile editor. Accessed by tapping "Personal Information" under Account Settings, the form documents the patient's Full Legal Name, Age, Date of Birth, Gender, Civil Status, Residential Address, Occupation, Contact Number, Height (cm), Weight (kg), and Baseline Blood Pressure. Dedicated Emergency Contact fields record primary and alternative emergency contact names, relationships, and telephone numbers to ensure clinical safety during severe allergic reactions.

---

![Figure 26 : Active Device Security & Remote Session Revocation Terminal](screenshots/mobile_device_sessions.png)

**Figure 26 : Active Device Security & Remote Session Revocation Terminal**

Figure 26 illustrates the Active Device Security & Remote Session Revocation Terminal of the K&A Clinic Patient Mobile App, which serves as the multi-device access security audit tool. Accessed via "Logged-in Devices" in App Settings, the interface lists all active hardware sessions authenticated to the patient's Medical Record Number. Each device entry displays the hardware platform icon (iOS, Android, Web), relative activity timestamp (e.g., "Active now", "2 hours ago"), and current device indicators. A high-priority destructive button ("Revoke All Other Sessions") invalidates all other active tokens remotely, safeguarding sensitive post-exposure health records.

---

