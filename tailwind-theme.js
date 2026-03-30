tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#ff8f6f",
                "on-primary": "#5c1400",
                "primary-container": "#ff7851",
                "on-primary-container": "#470e00",
                "secondary": "#929bfa",
                "on-secondary": "#0b1574",
                "secondary-container": "#343d96",
                "on-secondary-container": "#c9cdff",
                "tertiary": "#eeacff",
                "on-tertiary": "#621c7a",
                "tertiary-container": "#e699fd",
                "on-tertiary-container": "#570e6f",
                "background": "#0a0e14",
                "on-background": "#f1f3fc",
                "surface": "#0a0e14",
                "on-surface": "#f1f3fc",
                "surface-variant": "#20262f",
                "on-surface-variant": "#a8abb3",
                "outline": "#72757d",
                "outline-variant": "#44484f", /* <--- THIS IS THE FIX */
                "surface-container-lowest": "#000000",
                "surface-container-low": "#0f141a",
                "surface-container": "#151a21",
                "surface-container-high": "#1b2028",
                "surface-container-highest": "#20262f",
            },
            fontFamily: {
                "headline": ["Lexend"],
                "body": ["Be Vietnam Pro"],
                "label": ["Be Vietnam Pro"]
            },
            borderRadius: {"DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px"},
        },
    },
};
