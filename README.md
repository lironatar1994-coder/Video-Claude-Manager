# ספריית וידאו

כל הסרטונים שנוצרים, לפי פרויקט וגרסה — במקום אחד. http://localhost:5757

## הפעלה

לחיצה כפולה על `start.cmd` (או `npm start`).

## הוספת וידאו

```
node register.mjs <video.mp4> [--project P] [--version N] [--variant V] [--note "..."]
node register.mjs --scan <folder> --project P
```

או דרך ה־API (כשהשרת רץ):

```
POST /api/videos   { "path": "...", "project": "...", "note": "..." }
POST /api/scan     { "dir": "...",  "project": "..." }
```

או מכפתור ה־＋ באפליקציה.

- גרסה ווריאנט (dark / light / dubbed / feed …) מזוהים אוטומטית מהנתיב: תיקיית `v2/` או `-v2` בשם הקובץ. בלי מספר גרסה — רינדור חדש של וריאנט קיים מקבל את הגרסה הבאה.
- כל קובץ מועתק ל־`data/library`, כך שגרסאות ישנות נשמרות גם אם הקובץ המקורי נדרס.
- הסרה מהספרייה לא מוחקת את הקובץ המקורי.
- `node register.mjs --rethumb` — בניית תמונות ממוזערות מחדש.

## ייצור — https://lawebs.co.il/videos/

```
powershell -File deploy.ps1                  # GitHub ואז ייצור
powershell -File deploy.ps1 -Target GitHub   # רק GitHub
powershell -File deploy.ps1 -Target Prod     # רק ייצור (אחרי push)
```

הקוד נדחף ל־`main` ב־[GitHub](https://github.com/lironatar1994-coder/Video-Claude-Manager), והייצור עולה רק כש־`main` ב־GitHub תואם בדיוק לגרסה המקומית (`/videos/revision.txt`). הסרטונים עצמם לא נכנסים ל־git.

בונה עותק סטטי לקריאה בלבד (`scripts/build-static.mjs`), מעלה לשרת `vee-app.co.il` רק סרטונים חדשים, ומחליף גרסה דרך `scripts/deploy-linux.sh` (snippet של nginx תחת `lawebs.co.il`, גיבוי ו־rollback אוטומטי). על השרת: `/opt/video-library`. הדף מסומן `noindex`.

Claude Code מקבל הנחיה ב־`~/.claude/CLAUDE.md` לרשום כל וידאו שהוא יוצר.
