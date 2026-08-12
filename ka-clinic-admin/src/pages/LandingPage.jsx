import React, { useEffect, useRef } from 'react';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import AboutSection from '../components/landing/AboutSection';
import ServicesSection from '../components/landing/ServicesSection';
import CalendarSection from '../components/landing/CalendarSection';
import TeamSection from '../components/landing/TeamSection';
import AppSection from '../components/landing/AppSection';
import FAQSection from '../components/landing/FAQSection';
import Footer from '../components/landing/Footer';
import Chatbot from '../components/landing/Chatbot';
import { useFadeIn } from '../components/landing/useFadeIn';
import { GLOBAL_STYLES } from '../components/landing/constants';

export default function LandingPage({ onAdminClick }) {
  const pageRef = useRef(null);
  useFadeIn(pageRef);

  // Inject styles
  useEffect(() => {
    const id = 'ka-landing-styles';
    let el = document.getElementById(id);
    if (!el) { 
      el = document.createElement('style'); 
      el.id = id; 
      document.head.appendChild(el); 
    }
    el.textContent = GLOBAL_STYLES;
    return () => { 
      const existing = document.getElementById(id); 
      if (existing) existing.remove(); 
    };
  }, []);

  return (
    <div ref={pageRef} style={{fontFamily:"'Plus Jakarta Sans', 'Outfit', sans-serif",background:'var(--bg-light)',color:'var(--text)',overflowX:'hidden',lineHeight:1.6}}>
      <Navbar onAdminClick={onAdminClick} />
      <HeroSection />
      <HowItWorksSection />
      <AboutSection />
      <ServicesSection />
      <CalendarSection />
      <AppSection />
      <TeamSection />
      <FAQSection />
      <Footer />
      <Chatbot />
    </div>
  );
}