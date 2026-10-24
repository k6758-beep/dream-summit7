/* =====================================================================
 *  故事內容：story.js
 *  《夢想攻頂！正修冒險隊》的旁白、關卡、徽章、寶物名稱與背包裝備。
 *  改文案只要改這裡，不用動 game.js。
 *  （招生管道、資格、日期請改 data/admissions.js）
 * ===================================================================== */
window.STORY = {
  title: "夢想攻頂！正修冒險隊",
  tagline: "蒐集夢想寶物，解鎖你的升學路線，直達未來之門！",

  /* 開場旁白（約 10 秒） */
  opening: "畢業不是終點，而是冒險的開始！前方有好多條通往未來的路。選對裝備、找到適合自己的升學管道，就能直達正修之門！準備好了嗎？",

  /* 四個關卡：icon、名稱、任務、旁白（每關 1～2 句）、角色要走到的營地 node */
  stages: [
    { id: "id",     icon: "🪪", title: "身分關",     mission: "確認你的起點",     node: "camp",
      narr: "冒險者，先確認你的起點！不同的學習背景，會開啟不同的任務。選擇你的身分，開始尋找專屬路線！" },
    { id: "loot",   icon: "💎", title: "寶物關",     mission: "蒐集資格線索",     node: "ledge",
      narr: "想要打開升學寶箱，得先找到關鍵線索！你的學歷條件符合哪些路線？還有哪些裝備需要準備？" },
    { id: "zip",    icon: "🚡", title: "飛索關", mission: "選出你想挑戰的路線", node: "cliff",
      narr: "路線解鎖成功！有些道路需要參加入學考試，有些則有不同的資格與甄選要求。選擇你想挑戰的路線，看看還要準備什麼！" },
    { id: "summit", icon: "🏔️", title: "攻頂",       mission: "帶走你的攻略卡",   node: "summit",
      narr: "恭喜攻頂！你已經找到值得進一步了解的升學路線。把你的攻略卡收好，接下來就朝夢想前進吧！" }
  ],

  /* 身分徽章（依 admissions.js 的 type／art 判斷，只是名稱，不影響資格） */
  badges: {
    gen:  { icon: "📘", name: "學科探險家" },
    comp: { icon: "🔀", name: "雙軌冒險者" },
    voc:  { icon: "🔧", name: "技職工匠" },
    art:  { icon: "🎨", name: "藝術創作者" },
    unk:  { icon: "🧭", name: "起點冒險者" }
  },

  /* 寶物關：每個問題拿到的寶物（key 是 admissions.js 的問題 id） */
  loot: {
    rank:    { icon: "💠", name: "成績水晶" },
    coop:    { icon: "🎫", name: "產學通行證" },
    skills:  { icon: "🏅", name: "技能徽章" },
    special: { icon: "💎", name: "特殊寶石" },
    willing: { icon: "🧗", name: "攀登裝備" }
  },

  /* 飛索選路：要考試的路是「飛索」，免考試的路是「彈射台」 */
  modes: {
    exam:   { icon: "🚡", name: "飛索路線", note: "要準備考試" },
    noexam: { icon: "🚀", name: "彈射路線", note: "免考試，看資格與書審" }
  },

  /* 背包裝備：全部隨時可用（use 的寫法）
   *   dex 升學路線圖鑑／city 未來城市／elig 資格卷軸
   *   time 時間軸＋加入手機行事曆／seniors 學長姐經驗
   *   link:dept 正修科系介紹／link:visit 預約參訪／link:line 正修官方LINE@
   */
  equipment: [
    { id: "moreRoad",  icon: "🧭", item: "升學地圖",       label: "再了解一個升學管道", use: "dex" },
    { id: "dept",      icon: "🔍", item: "科系探索鏡",     label: "查一個想讀的科系", use: "city" },
    { id: "checkMe",   icon: "📜", item: "資格卷軸",       label: "確認自己可以走哪些管道", use: "elig" },
    { id: "dates",     icon: "⏰", item: "時間警報器",     label: "了解重要報名時間、加入行事曆", use: "time" },
    { id: "seniors",   icon: "🗺️", item: "學長姐的手繪地圖", label: "參考學長姐經驗", use: "seniors" },
    { id: "csuDept",   icon: "🏫", item: "正修探索鏡",     label: "了解正修相關科系", use: "link:dept" },
    { id: "visit",     icon: "🎟️", item: "參訪通行證",     label: "預約參訪", use: "link:visit" },
    { id: "ask",       icon: "📻", item: "求助對講機",     label: "詢問正修招生專人", use: "link:line" }
  ],

  /* 學長姐的手繪地圖（paths 對應 admissions.js 的管道 id） */
  seniorStories: [
    { face: "👩‍🍳", who: "高職餐飲科學姊", text: "我高二就去考乙級證照，後來走技優甄審，根本沒考統測。", paths: ["skillrev"] },
    { face: "🧑‍💻", who: "普通科學長", text: "我一直以為普通科不能讀科大，結果學測完就走申請入學進入正修科大了。", paths: ["caac"] },
    { face: "🧑‍🔧", who: "先工作的學長", text: "我白天在工廠上班，晚上讀進修部，畢業一樣是學士。", paths: ["night"] },
    { face: "🎨", who: "喜歡畫畫的學姊", text: "我 12 月就用作品集報特殊選才，寒假前就知道結果了。", paths: ["special"] }
  ],

  /* 攻略卡最後一句 */
  motto: "未來不是選出來的答案，而是走出來的路。"
};
