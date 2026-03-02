import React, { useEffect } from 'react';

const AdBanner = ({ style, className }) => {
    const adClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;

    useEffect(() => {
        if (adClientId) {
            try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (e) {
                console.error('AdSense script error:', e);
            }
        }
    }, [adClientId]);

    if (!adClientId) {
        return null; // Don't render anything if there's no client ID configured
    }

    return (
        <div className={`ad-banner-container ${className || ''}`} style={{ textAlign: 'center', margin: '20px auto', ...style }}>
            <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client={adClientId}
                data-ad-slot="auto"
                data-ad-format="auto"
                data-full-width-responsive="true"
            ></ins>
        </div>
    );
};

export default AdBanner;
