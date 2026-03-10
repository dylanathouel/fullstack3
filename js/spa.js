/**
 * spa.js – client-side router
 * ======================================================
 * Manages page transitions in the SPA without reloading the page.
 * Based on the hash (#) in the URL (e.g. index.html#login).
 *
 * Guard support:
 *   Each route can include a guard function that is checked before rendering.
 *   If the guard returns false, onGuardFail is called instead.
 *   This prevents protected content from flashing before the JS redirect fires.
 */
const SPA = (() => {

    // Map of all registered routes: { [hash]: routeConfig }
    const routes    = {};
    let currentRoute = null;
    const container  = document.getElementById('main-content');

    /**
     * _loadTemplate – clones the content of a <template> from the DOM and
     * returns a node ready to be inserted.
     */
    function _loadTemplate(templateId) {
        const tmpl = document.getElementById(templateId);
        if (!tmpl) {
            console.error(`[SPA] Template not found: #${templateId}`);
            return null;
        }
        return tmpl.content.cloneNode(true);
    }

    /**
     * _navigate – routes based on the current hash in the URL.
     * Checks the guard, renders the template and fires onEnter.
     * Triggered on every hashchange event and on init.
     */
    function _navigate() {
        const hash  = window.location.hash.replace('#', '') || 'login';
        const route = routes[hash];

        // Unknown route – redirect to default
        if (!route) {
            SPA.navigateTo('login');
            return;
        }

        // Already on the same route – no re-render needed
        if (currentRoute === hash) return;

        // Check the guard before rendering the template.
        // A guard is a "gatekeeper" function that returns true/false
        // based on an authorisation condition (e.g. is the user logged in?).
        if (typeof route.guard === 'function' && !route.guard()) {
            if (typeof route.onGuardFail === 'function') route.onGuardFail();
            return;  // currentRoute is not updated – keeps the previous value
        }

        currentRoute = hash;

        // Clear existing content and inject the new template
        container.innerHTML = '';
        const content = _loadTemplate(route.templateId);
        if (content) container.appendChild(content);

        // Run page initialisation code (event listeners, data loading, etc.)
        if (typeof route.onEnter === 'function') route.onEnter();
    }

    /* ─── Public interface ─── */
    return {

        /**
         * addRoute – registers a route definition with the router.
         */
        addRoute(hash, templateId, onEnter, guard, onGuardFail) {
            routes[hash] = { templateId, onEnter, guard, onGuardFail };
        },

        /**
         * navigateTo – navigates to a page by updating the hash in the URL.
         */
        navigateTo(hash) {
            window.location.hash = hash;
        },

        /**
         * init – initialises the router.
         * Listens for the hashchange event and performs the initial routing
         * based on the current URL.
         */
        init() {
            window.addEventListener('hashchange', _navigate);
            _navigate();
        },

        /**
         * getCurrentRoute – returns the hash of the currently active route.
         */
        getCurrentRoute() {
            return currentRoute;
        },

        /**
         * resetRoute – resets currentRoute to allow re-rendering of the same page.
         * Useful e.g. after logout followed by login.
         */
        resetRoute() {
            currentRoute = null;
        }
    };

})();
