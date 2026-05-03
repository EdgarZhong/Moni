/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── 品牌核心色 ── */
        ink:        '#222222',   // 深底：标题文字、粗边框、主按钮底色
        surface:    '#F5F0EB',   // 米白：页面背景
        white:      '#FFFFFF',   // 卡片底色

        /* ── 品牌功能色 ── */
        coral:      '#FF6B6B',   // 支出金额、危险态
        sky:        '#7EC8E3',   // 信息态
        sunflower:  '#F9D56E',   // 装饰、部分分类
        mint:       '#4ECDC4',   // 收入金额、AI 状态、健康态
        amber:      '#E88B4D',   // 预算警戒、未分类提示

        /* ── 中性色 ── */
        dim:        '#888888',   // 次要文字
        muted:      '#DDDDDD',   // 边框、分割线
        faint:      '#EEEEEE',   // 极淡分割线

        /* ── 状态表面色 ── */
        'danger-surface':  '#FFF0F0',
        'danger-border':   '#FFB8B8',
        'warn-surface':    '#FFF8F0',
        'warn-border':     '#F0C89A',
        'success-surface': '#F0F8F0',
        'success-text':    '#3B6D11',
        'info-surface':    '#EBF5FF',
        'uncat-surface':   '#FFF5EB',

        /* ── 分类色深色文字（高频引用） ── */
        'uncat-text':  '#D85A30',
      },

      fontFamily: {
        brand: ['"Nunito"', '-apple-system', '"Helvetica Neue"', 'sans-serif'],
        mono:  ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      borderRadius: {
        'card-lg':  '16px',    // 设置页 Root SectionCard
        'card':     '14px',    // 主卡片、主按钮
        'card-sm':  '12px',    // 内容卡、次级按钮
        'card-xs':  '10px',    // 统计小卡、小元素
        'pill':     '9999px',  // Pill / Tag
      },

      borderWidth: {
        'primary':   '2px',     // 主卡描边
        'secondary': '1.5px',   // 内容卡、次级按钮描边
        'divider':   '0.5px',   // 列表分割线
      },

      spacing: {
        '1':  '4px',
        '2':  '8px',
        '3':  '12px',
        '4':  '16px',
        '5':  '20px',
        '6':  '24px',
        '8':  '32px',
        '12': '48px',
        '16': '64px',
      },

      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}
