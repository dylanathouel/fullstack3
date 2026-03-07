/**
 * spa.js – מנגנון ניתוב צד-לקוח (Client-Side Router)
 * ======================================================
 * מנהל מעברים בין עמודים ביישום ה-SPA ללא טעינה מחדש של הדף.
 * מבוסס על hash (#) בכתובת ה-URL (למשל: index.html#login).
 *
 * תמיכה ב-Guard:
 *   כל route יכול לכלול פונקציית guard שנבדקת לפני הרינדור.
 *   אם ה-guard מחזיר false, תיקרא פונקציית onGuardFail במקום.
 *   כך מונעים הצגת תוכן לפני שה-JavaScript הספיק להפנות חזרה.
 */
const SPA = (() => {

    // מפת כל ה-routes הרשומים: { [hash]: routeConfig }
    const routes    = {};
    let currentRoute = null;
    const container  = document.getElementById('main-content');

    /**
     * _loadTemplate – מעתיק תוכן של <template> מה-DOM ומחזיר צומת מוכן להכנסה.
     * @param {string} templateId – ה-id של אלמנט <template> בדף
     * @returns {DocumentFragment|null}
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
     * _navigate – מנתב לפי ה-hash הנוכחי ב-URL.
     * בודק guard, מרנדר את ה-template ומפעיל את onEnter.
     * מופעל על כל שינוי hash וב-init.
     */
    function _navigate() {
        const hash  = window.location.hash.replace('#', '') || 'login';
        const route = routes[hash];

        // route לא מוגדר – הפניה לדפדפן ברירת מחדל
        if (!route) {
            SPA.navigateTo('login');
            return;
        }

        // אם כבר באותו route אין צורך ברינדור חוזר
        if (currentRoute === hash) return;

        // בדיקת guard לפני רינדור ה-template
        // guard זה בעצם "שומר סף" שממוש על יד פונקציה שמחזירה true/false לפי תנאי הרשאה (למשל: האם המשתמש מחובר)    
        if (typeof route.guard === 'function' && !route.guard()) {
            if (typeof route.onGuardFail === 'function') route.onGuardFail();
            return;  // currentRoute לא מתעדכן – נשמר הערך הקודם
        }

        currentRoute = hash;

        // ניקוי תוכן קיים והוספת ה-template החדש
        container.innerHTML = '';
        const content = _loadTemplate(route.templateId);
        if (content) container.appendChild(content);

        // הפעלת קוד אתחול הדף (event listeners, טעינת נתונים, וכו')
        if (typeof route.onEnter === 'function') route.onEnter();
    }

    /* ─── ממשק ציבורי ─── */
    return {

        /**
         * addRoute – מוסיף הגדרת route למנגנון הניתוב.
         * @param {string}   hash        – ה-hash של ה-route (בלי #)
         * @param {string}   templateId  – id של <template> בדף
         * @param {Function} onEnter     – פונקציה שתופעל לאחר הרינדור
         * @param {Function} [guard]     – אם מוגדר, נבדק לפני הרינדור (חייב להחזיר boolean)
         * @param {Function} [onGuardFail] – מופעל אם ה-guard נכשל (לרוב ניווט לדף אחר)
         */
        addRoute(hash, templateId, onEnter, guard, onGuardFail) {
            routes[hash] = { templateId, onEnter, guard, onGuardFail };
        },

        /**
         * navigateTo – מנווט לדף על-ידי שינוי ה-hash ב-URL.
         * @param {string} hash
         */
        navigateTo(hash) {
            window.location.hash = hash;
        },

        /**
         * init – מאתחל את מנגנון הניתוב.
         * מאזין לאירוע hashchange ומבצע ניתוב ראשוני לפי ה-URL הנוכחי.
         */
        init() {
            window.addEventListener('hashchange', _navigate);
            _navigate();
        },

        /**
         * getCurrentRoute – מחזיר את ה-hash של ה-route הפעיל כרגע.
         * @returns {string|null}
         */
        getCurrentRoute() {
            return currentRoute;
        },

        /**
         * resetRoute – מאפס את ה-currentRoute כדי לאפשר רינדור חוזר של אותו דף.
         * שימושי למשל אחרי התנתקות וכניסה מחדש.
         */
        resetRoute() {
            currentRoute = null;
        }
    };

})();
