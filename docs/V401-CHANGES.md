# v4.0.1

- Pricing is display-only and requires no Firebase imports. Commercial activation remains disabled pending integration.
- Shared full-screen queue-themed sign-in overlay with light/dark mode and reduced-motion support. No artificial delay. Known workspace and verified membership reads overlap; the chosen active membership is still validated against server data. First-time sign-in and slow networks may still take time.
- Admin attendance archive is loaded on first opening the tab, only queries the Pakistan-local current month, opens the newest day automatically, and lazily reads older expanded dates. Specific-date finder retains all-date access. No historical data is deleted.
- Existing rules and commercial backend unchanged. Test with fictional data only.
