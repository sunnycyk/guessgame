import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function CookieDisclaimer() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const cookiePreference = localStorage.getItem('cookiePreference');
        if (!cookiePreference) {
            // Show disclaimer if no preference is saved
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookiePreference', 'accepted');
        setIsVisible(false);
    };

    const handleReject = () => {
        localStorage.setItem('cookiePreference', 'rejected');
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="cookie-disclaimer"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                    <div className="cookie-content">
                        <p>
                            🍪 We use cookies to enhance your experience, analyze site traffic, and serve tailored content.
                            By clicking "Accept All", you consent to our use of cookies.
                        </p>
                        <div className="cookie-actions">
                            <button
                                onClick={handleReject}
                                className="cookie-btn cookie-btn-reject"
                            >
                                Reject All
                            </button>
                            <button
                                onClick={handleAccept}
                                className="cookie-btn cookie-btn-accept"
                            >
                                Accept All
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default CookieDisclaimer;
