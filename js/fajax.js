/**
 * fajax.js – מחלקת FXMLHttpRequest
 * ===================================
 * מדמה את המחלקה המובנית XMLHttpRequest של הדפדפן.
 * במקום לשלוח בקשות HTTP אמיתיות, מעבירה את הבקשה
 * לרשת התקשורת המדומה (Network) אשר מנתבת אותה לשרת המתאים.
 *
 * שימוש:
 *   const xhr = new FXMLHttpRequest();
 *   xhr.open('POST', '/auth/login');
 *   xhr.setRequestHeader('Content-Type', 'application/json');
 *   xhr.onload  = () => { ... };   // נקרא כשמגיעה תגובה (כל status)
 *   xhr.onerror = () => { ... };   // נקרא כשהרשת "מפילה" את ההודעה
 *   xhr.send(JSON.stringify({ username, password }));
 */
class FXMLHttpRequest {

    /* בנאי – מאתחל את כל השדות לערכי ברירת מחדל */
    constructor() {
        this.method       = null;   // מתודת HTTP (GET / POST / PUT / DELETE)
        this.url          = null;   // כתובת היעד
        this.data         = null;   // גוף הבקשה (string JSON)
        this.status       = null;   // קוד תגובה HTTP שהתקבל מהשרת
        this.responseText = null;  // גוף התגובה כ-string JSON
        this.onload       = null;   // callback – נקרא כשמתקבלת תגובה מהשרת
        this.onerror      = null;   // callback – נקרא כשהרשת מפילה את ההודעה
        this._headers     = {};     // כותרות הבקשה (Authorization, Content-Type, ...)
    }

    /**
     * open – מגדיר את מתודת ה-HTTP וכתובת היעד של הבקשה.
     * חייב להיקרא לפני send.
     */
    open(method, url) {
        this.method = method.toUpperCase();
        this.url    = url;
    }

    /**
     * setRequestHeader – מוסיף כותרת לבקשה (למשל Authorization, Content-Type).
     * חייב להיקרא לאחר open ולפני send.
     */
    setRequestHeader(key, value) {
        this._headers[key] = value;
    }

    /**
     * send – שולח את הבקשה לרשת התקשורת המדומה.
     * אחרי קריאה זו הבקשה "עוזבת" את הלקוח; התגובה תגיע דרך onload / onerror.
     * @param {string|null} data – גוף הבקשה כ-JSON string (אופציונלי)
     */
    send(data = null) {
        if (data !== null) {
            this.data = data;
        }
        // מעביר את האובייקט כולו לרשת; הרשת תדאג לניתוב, השהיה והשמטה
        Network.transmit(this);
    }

    /**
     * _handleResponse – מטופל על-ידי הרשת כשהתגובה מגיעה מהשרת.
     * מעדכן status ו-responseText ומפעיל את callback המתאים.
     * (מתודה פנימית – אין לקרוא לה ישירות מקוד לקוח)
     * @param {{ status: number, body: object }} responseObj
     */
    _handleResponse(responseObj) {
        this.status       = responseObj.status;
        this.responseText = JSON.stringify(responseObj.body);
        // onload נקרא תמיד כשיש תגובה – הלקוח בודק את this.status בעצמו
        if (typeof this.onload === 'function') {
            this.onload();
        }
    }

    /**
     * _handleNetworkError – מטופל על-ידי הרשת כשהמסגרת "נופלת" (השמטה).
     * מאפס את status ומפעיל את onerror.
     * (מתודה פנימית – אין לקרוא לה ישירות מקוד לקוח)
     */
    _handleNetworkError() {
        this.status       = 0;
        this.responseText = null;
        if (typeof this.onerror === 'function') {
            this.onerror();
        }
    }
}
