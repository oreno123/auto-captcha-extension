// 元素选择器生成器
// 从原始脚本中提取并优化

class ElementSelector {
  constructor() {
    this.strategies = [
      'byVueId',
      'byPlaceholder',
      'byAlt',
      'byName',
      'bySrc',
      'byOnClick',
      'byCssPath',
      'byClimbing'
    ];
  }

  /**
   * 生成唯一选择器（主入口）
   */
  generate(element) {
    if (!element || !element.tagName) {
      return null;
    }

    const tagName = element.tagName.toLowerCase();
    
    // 按优先级尝试各种策略
    for (const strategy of this.strategies) {
      const selector = this[strategy](element, tagName);
      if (selector && this.isUnique(selector)) {
        console.log(`✓ 使用策略: ${strategy}, 选择器: ${selector}`);
        return selector;
      }
    }

    // 如果所有策略都失败，返回 null
    console.warn('无法生成唯一选择器');
    return null;
  }

  /**
   * 验证选择器是否唯一
   */
  isUnique(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * 策略1: 通过 Vue 的 data-v-* 属性
   */
  byVueId(element, tagName) {
    const attrs = element.attributes;
    if (!attrs) return null;

    for (let i = 0; i < attrs.length; i++) {
      const attrName = attrs[i].name;
      if (attrName.startsWith('data-v-')) {
        return `${tagName}[${attrName}]`;
      }
    }
    return null;
  }

  /**
   * 策略2: 通过 placeholder 属性
   */
  byPlaceholder(element) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      return `${element.tagName.toLowerCase()}[placeholder='${placeholder}']`;
    }
    return null;
  }

  /**
   * 策略3: 通过 alt 属性
   */
  byAlt(element) {
    const alt = element.getAttribute('alt');
    if (alt && alt.trim()) {
      return `${element.tagName.toLowerCase()}[alt='${alt}']`;
    }
    return null;
  }

  /**
   * 策略4: 通过 name 属性
   */
  byName(element, tagName) {
    const name = element.name;
    if (!name) return null;

    const selector = `${tagName}[name='${name}']`;
    return selector;
  }

  /**
   * 策略5: 通过 src 属性（去除参数）
   */
  bySrc(element, tagName) {
    const src = element.getAttribute('src');
    if (!src || src.startsWith('data:image/')) return null;

    let cleanSrc = src;
    const questionMarkIndex = src.indexOf('?');
    if (questionMarkIndex !== -1) {
      cleanSrc = src.substring(0, questionMarkIndex + 1);
    }

    if (cleanSrc.length < 200) {
      return `${tagName}[src^='${cleanSrc}']`;
    }
    return null;
  }

  /**
   * 策略6: 通过 onclick 属性
   */
  byOnClick(element, tagName) {
    const onclick = element.getAttribute('onclick');
    if (!onclick) return null;

    let cleanOnclick = onclick;
    const parenIndex = onclick.indexOf('(');
    if (parenIndex !== -1) {
      cleanOnclick = onclick.substring(0, parenIndex + 1);
    }

    if (cleanOnclick.length < 200) {
      return `${tagName}[onclick^='${cleanOnclick}']`;
    }
    return null;
  }

  /**
   * 策略7: 生成完整的 CSS 路径
   */
  byCssPath(element) {
    if (!(element instanceof Element)) return null;

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();

      // 如果有 ID 且不是动态生成的
      if (current.id && this.isValidId(current.id)) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }

      // 计算同类型兄弟元素中的位置
      let sibling = current;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.nodeName.toLowerCase() === selector) {
          nth++;
        }
      }

      if (nth > 1) {
        selector += `:nth-of-type(${nth})`;
      }

      path.unshift(selector);
      current = current.parentNode;
    }

    return path.join(' > ');
  }

  /**
   * 策略8: 通过爬取父级元素
   */
  byClimbing(element, tagName) {
    const climb = (el) => {
      if (!el || !el.parentNode) return '';

      const id = el.id;
      const className = el.className;
      const localName = el.tagName?.toLowerCase();

      let selector = '';

      // 构建当前元素的选择器
      if (this.isValidId(id)) {
        selector = `#${id}`;
      } else if (className && typeof className === 'string') {
        const classes = className.trim().replace(/\s+/g, '.');
        selector = `.${classes}`;
      }

      if (localName) {
        selector = localName + selector;
      }

      // 检查是否唯一
      if (selector && this.isUnique(selector)) {
        return selector;
      }

      // 继续向上爬
      const parentSelector = climb(el.parentNode);
      return parentSelector ? `${parentSelector} > ${selector || localName}` : selector;
    };

    return climb(element);
  }

  /**
   * 判断 ID 是否有效（不是动态生成的）
   */
  isValidId(id) {
    if (!id) return false;
    // 排除一些明显动态生成的 ID
    if (id.includes('exifviewer-img-')) return false;
    if (id.length > 40) return false; // 太长的 ID 可能是随机生成的
    return true;
  }
}

// 如果在浏览器环境，挂载到 window
if (typeof window !== 'undefined') {
  window.ElementSelector = ElementSelector;
}

// 如果在 Node.js 环境，导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElementSelector;
}

