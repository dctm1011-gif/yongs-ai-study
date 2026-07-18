/**
 * DataFormatter - Convert raw data to user-friendly format
 * Handles category-specific formatting for different data types
 */

interface FormattedItem {
  id: string;
  label: string;
  value: string;
  category?: string;
  metadata?: Record<string, string>;
}

interface FormattedData {
  category: string;
  icon: string;
  summary: string;
  items: FormattedItem[];
  stats?: Record<string, string | number>;
}

export class DataFormatter {
  /**
   * Format date to readable format
   */
  static formatDate(dateString: string | number): string {
    try {
      const date = typeof dateString === 'string'
        ? new Date(dateString)
        : new Date(dateString);

      if (isNaN(date.getTime())) return String(dateString);

      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      };
      return date.toLocaleDateString('ko-KR', options).replace(/\. /g, '-').replace('.', ' ');
    } catch {
      return String(dateString);
    }
  }

  /**
   * Format numbers with thousands separator
   */
  static formatNumber(num: any): string {
    if (typeof num !== 'number') return String(num);
    return num.toLocaleString('ko-KR');
  }

  /**
   * Format English data (words, quizzes)
   */
  static formatEnglish(data: any): FormattedData {
    const items: FormattedItem[] = [];
    let wordCount = 0;
    let quizCount = 0;

    if (Array.isArray(data)) {
      // Array of words
      data.slice(0, 10).forEach((item: any, idx: number) => {
        if (item.word) {
          items.push({
            id: item.id || String(idx),
            label: item.word,
            value: item.meaning || item.pos || '뜻 없음',
            category: 'word',
            metadata: {
              '뜻': item.meaning || '-',
              '품사': item.pos || '-',
              '추가': this.formatDate(item.date) || '-',
              '예문': (item.example_en || item.example_ko || '-').substring(0, 50),
            },
          });
          wordCount++;
        }
      });
    } else if (typeof data === 'object' && data !== null) {
      // Object with multiple sections
      if (Array.isArray(data.words)) {
        wordCount = data.words.length;
        data.words.slice(0, 5).forEach((item: any, idx: number) => {
          items.push({
            id: item.id || String(idx),
            label: item.word,
            value: item.meaning,
            category: 'word',
            metadata: {
              '뜻': item.meaning,
              '예문': (item.example_en || '').substring(0, 40),
            },
          });
        });
      }

      if (Array.isArray(data.quizzes)) {
        quizCount = data.quizzes.length;
      }
    }

    return {
      category: 'english',
      icon: '📚',
      summary: `총 ${wordCount}개 단어, ${quizCount}개 퀴즈`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: '데이터 없음',
        value: '아직 저장된 단어가 없습니다',
      }],
      stats: {
        '단어': wordCount,
        '퀴즈': quizCount,
      },
    };
  }

  /**
   * Format TOEFL data (scores, tests)
   */
  static formatToefl(data: any): FormattedData {
    const items: FormattedItem[] = [];
    let scores: number[] = [];
    let testCount = 0;

    if (Array.isArray(data)) {
      data.slice(0, 10).forEach((item: any, idx: number) => {
        const score = item.score || item.total || 0;
        if (score > 0) scores.push(score);

        items.push({
          id: item.id || String(idx),
          label: `시험 #${idx + 1}`,
          value: `${score}점`,
          category: 'score',
          metadata: {
            '날짜': this.formatDate(item.date || item.testDate || ''),
            '점수': String(score),
            '레벨': this.getEnglishLevel(score),
            'Reading': String(item.reading || '-'),
            'Listening': String(item.listening || '-'),
            'Speaking': String(item.speaking || '-'),
            'Writing': String(item.writing || '-'),
          },
        });
        testCount++;
      });
    } else if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.tests)) {
        data.tests.forEach((item: any, idx: number) => {
          const score = item.score || 0;
          if (score > 0) scores.push(score);
          testCount++;
        });
      }
    }

    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return {
      category: 'toefl',
      icon: '🎓',
      summary: `${testCount}개 시험 기록`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: 'TOEFL 점수 없음',
        value: '아직 시험 기록이 없습니다',
      }],
      stats: {
        '시험': testCount,
        '최고': maxScore,
        '평균': avgScore,
      },
    };
  }

  /**
   * Format Papers data (research papers)
   */
  static formatPapers(data: any): FormattedData {
    const items: FormattedItem[] = [];
    let paperCount = 0;

    if (Array.isArray(data)) {
      data.slice(0, 10).forEach((item: any, idx: number) => {
        items.push({
          id: item.id || item.arxiv_id || String(idx),
          label: item.title || `논문 #${idx + 1}`,
          value: item.authors ? item.authors.substring(0, 50) : 'Author 없음',
          category: 'paper',
          metadata: {
            '제목': (item.title || '-').substring(0, 60),
            '저자': (item.authors || '-').substring(0, 40),
            '발행': this.formatDate(item.published_date || item.pub_date || ''),
            '카테고리': item.category || item.subject || '-',
            '요약': (item.summary || item.abstract || '-').substring(0, 60),
          },
        });
        paperCount++;
      });
    }

    return {
      category: 'papers',
      icon: '📄',
      summary: `${paperCount}개 논문`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: '논문 없음',
        value: '아직 저장된 논문이 없습니다',
      }],
      stats: {
        '논문': paperCount,
      },
    };
  }

  /**
   * Format Investment data (preferences, interests)
   */
  static formatInvestment(data: any): FormattedData {
    const items: FormattedItem[] = [];
    let categories: string[] = [];

    if (typeof data === 'object' && data !== null) {
      if (data.interests && typeof data.interests === 'object') {
        Object.entries(data.interests).forEach(([key, value]: any) => {
          if (value) {
            categories.push(key);
            items.push({
              id: key,
              label: this.formatCategoryName(key),
              value: value === true ? '관심있음' : String(value),
              category: 'interest',
              metadata: {
                '상태': value === true || value > 0 ? '활성' : '비활성',
              },
            });
          }
        });
      }

      if (data.preferences && typeof data.preferences === 'object') {
        Object.entries(data.preferences).forEach(([key, value]: any) => {
          items.push({
            id: key,
            label: this.formatCategoryName(key),
            value: String(value),
            category: 'preference',
          });
        });
      }
    }

    return {
      category: 'investment',
      icon: '💰',
      summary: `${categories.length}개 관심사`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: '관심사 없음',
        value: '아직 설정된 관심사가 없습니다',
      }],
      stats: {
        '카테고리': categories.length,
      },
    };
  }

  /**
   * Format Play data (content watched)
   */
  static formatPlay(data: any): FormattedData {
    const items: FormattedItem[] = [];
    let contentCount = 0;

    if (Array.isArray(data)) {
      data.slice(0, 10).forEach((item: any, idx: number) => {
        items.push({
          id: item.id || String(idx),
          label: item.title || item.name || `콘텐츠 #${idx + 1}`,
          value: item.genre || item.type || '정보 없음',
          category: 'content',
          metadata: {
            '제목': (item.title || '-').substring(0, 50),
            '장르': item.genre || '-',
            '시청': this.formatDate(item.watched_date || item.date || ''),
            '출연': (item.cast || '-').substring(0, 40),
          },
        });
        contentCount++;
      });
    } else if (typeof data === 'object' && data !== null) {
      if (data.trends && Array.isArray(data.trends)) {
        data.trends.slice(0, 10).forEach((item: any, idx: number) => {
          items.push({
            id: item.id || String(idx),
            label: item.title || `트렌드 #${idx + 1}`,
            value: item.category || '트렌드',
            category: 'trend',
          });
          contentCount++;
        });
      }
    }

    return {
      category: 'play',
      icon: '🎬',
      summary: `${contentCount}개 콘텐츠`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: '콘텐츠 없음',
        value: '아직 시청 기록이 없습니다',
      }],
      stats: {
        '콘텐츠': contentCount,
      },
    };
  }

  /**
   * Format Progress data (achievements, stats)
   */
  static formatProgress(data: any): FormattedData {
    const items: FormattedItem[] = [];

    if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, value]: any) => {
        if (typeof value === 'object' && value !== null) {
          items.push({
            id: key,
            label: this.formatCategoryName(key),
            value: this.getProgressSummary(value),
            category: 'progress',
            metadata: {
              '타입': typeof value,
              '데이터': JSON.stringify(value).substring(0, 50),
            },
          });
        } else {
          items.push({
            id: key,
            label: this.formatCategoryName(key),
            value: String(value),
            category: 'stat',
          });
        }
      });
    }

    return {
      category: 'progress',
      icon: '📈',
      summary: `${items.length}개 항목`,
      items: items.length > 0 ? items : [{
        id: '1',
        label: '진행 데이터 없음',
        value: '아직 기록된 진행사항이 없습니다',
      }],
      stats: {
        '항목': items.length,
      },
    };
  }

  /**
   * Format generic object data
   */
  static formatGeneric(key: string, data: any): FormattedData {
    const items: FormattedItem[] = [];

    if (Array.isArray(data)) {
      data.slice(0, 10).forEach((item: any, idx: number) => {
        items.push({
          id: String(idx),
          label: typeof item === 'object' ? item.name || item.title || `항목 ${idx + 1}` : String(item),
          value: typeof item === 'object' ? JSON.stringify(item).substring(0, 50) : String(item),
        });
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([k, v]: any) => {
        items.push({
          id: k,
          label: this.formatCategoryName(k),
          value: typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : String(v),
        });
      });
    } else {
      items.push({
        id: '1',
        label: String(data),
        value: '단순 데이터',
      });
    }

    return {
      category: key,
      icon: '📦',
      summary: `${items.length}개 항목`,
      items,
    };
  }

  /**
   * Format category name for display
   */
  private static formatCategoryName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get English level from TOEFL score
   */
  private static getEnglishLevel(score: number): string {
    if (score >= 110) return '매우 우수 (Advanced)';
    if (score >= 100) return '우수 (Upper-Intermediate)';
    if (score >= 80) return '중상 (Intermediate)';
    if (score >= 60) return '중 (Lower-Intermediate)';
    return '초급 (Beginner)';
  }

  /**
   * Get progress summary from object
   */
  private static getProgressSummary(value: any): string {
    if (Array.isArray(value)) {
      return `${value.length}개 항목`;
    } else if (typeof value === 'object') {
      return `${Object.keys(value).length}개 속성`;
    }
    return String(value);
  }

  /**
   * Route to appropriate formatter based on key
   */
  static formatByCategory(key: string, value: any): FormattedData {
    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('english')) {
      return this.formatEnglish(value);
    } else if (lowerKey.includes('toefl')) {
      return this.formatToefl(value);
    } else if (lowerKey.includes('paper')) {
      return this.formatPapers(value);
    } else if (lowerKey.includes('investment')) {
      return this.formatInvestment(value);
    } else if (lowerKey.includes('play')) {
      return this.formatPlay(value);
    } else if (lowerKey.includes('progress')) {
      return this.formatProgress(value);
    }

    return this.formatGeneric(key, value);
  }
}

export default DataFormatter;
