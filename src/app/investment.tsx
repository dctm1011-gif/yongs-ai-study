import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Dimensions,
  Alert as RNAlert,
  Modal,
  useWindowDimensions,
  ToastAndroid,
  Animated,
  Linking,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useInvestmentSync, InvestmentColumn, BoxPlotPoint, DongChartEntry, DongEntry, DailyTerm, NewsArticle, RegionChartEntry, JukjeonComplex, RateChart, RateDataPoint, SupplyDemandIndex } from '../hooks/useInvestmentSync';
import { getDatabase, ref, set as dbSet, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import { useScreenFade } from '../hooks/useScreenFade';

const { width } = Dimensions.get('window');

// ─── 경기도 학교 목록 (출처: NEIS 나이스 교육정보시스템) ──────────────────
// 위치 데이터는 NEIS API 공식 조회 결과 기준. 순위는 지역별 나열 (학업성취도 공식 통계 미공개)
type SchoolEntry = { rank: number; name: string; city: string; gu: string; dong: string };

const GYEONGGI_ELEM_SCHOOLS: SchoolEntry[] = [
  { rank: 1,  name: '이현초등학교',   city: '용인시', gu: '기흥구', dong: '보정동'    },
  { rank: 2,  name: '상현초등학교',   city: '용인시', gu: '수지구', dong: '상현동'    },
  { rank: 3,  name: '서현초등학교',   city: '성남시', gu: '분당구', dong: '서현동'    },
  { rank: 4,  name: '보평초등학교',   city: '성남시', gu: '분당구', dong: '판교동'    },
  { rank: 5,  name: '분당초등학교',   city: '성남시', gu: '분당구', dong: '서현동'    },
  { rank: 6,  name: '판교초등학교',   city: '성남시', gu: '분당구', dong: '판교동'    },
  { rank: 7,  name: '손곡초등학교',   city: '용인시', gu: '수지구', dong: '동천동'    },
  { rank: 8,  name: '백현초등학교',   city: '성남시', gu: '분당구', dong: '정자동'    },
  { rank: 9,  name: '광교초등학교',   city: '수원시', gu: '영통구', dong: '이의동'    },
  { rank: 10, name: '양영초등학교',   city: '성남시', gu: '분당구', dong: '서현동'    },
  { rank: 11, name: '수지초등학교',   city: '용인시', gu: '수지구', dong: '풍덕천동'  },
  { rank: 12, name: '운중초등학교',   city: '성남시', gu: '분당구', dong: '운중동'    },
  { rank: 13, name: '야탑초등학교',   city: '성남시', gu: '분당구', dong: '야탑동'    },
  { rank: 14, name: '동백초등학교',   city: '용인시', gu: '기흥구', dong: '동백동'    },
  { rank: 15, name: '매탄초등학교',   city: '수원시', gu: '영통구', dong: '매탄동'    },
  { rank: 16, name: '성복초등학교',   city: '용인시', gu: '수지구', dong: '성복동'    },
  { rank: 17, name: '풍덕초등학교',   city: '용인시', gu: '수지구', dong: '풍덕천동'  },
  { rank: 18, name: '구성초등학교',   city: '용인시', gu: '기흥구', dong: '마북동'    },
  { rank: 19, name: '구미초등학교',   city: '성남시', gu: '분당구', dong: '구미동'    },
  { rank: 20, name: '불정초등학교',   city: '성남시', gu: '분당구', dong: '구미동'    },
  { rank: 21, name: '이매초등학교',   city: '성남시', gu: '분당구', dong: '이매동'    },
  { rank: 22, name: '수내초등학교',   city: '성남시', gu: '분당구', dong: '수내동'    },
  { rank: 23, name: '낙생초등학교',   city: '성남시', gu: '분당구', dong: '판교동'    },
  { rank: 24, name: '영통초등학교',   city: '수원시', gu: '영통구', dong: '영통동'    },
  { rank: 25, name: '원천초등학교',   city: '수원시', gu: '영통구', dong: '매탄동'    },
  { rank: 26, name: '청명초등학교',   city: '수원시', gu: '영통구', dong: '영통동'    },
  { rank: 27, name: '죽전초등학교',   city: '용인시', gu: '수지구', dong: '죽전동'    },
  { rank: 28, name: '보정초등학교',   city: '용인시', gu: '기흥구', dong: '보정동'    },
  { rank: 29, name: '상갈초등학교',   city: '용인시', gu: '기흥구', dong: '상갈동'    },
  { rank: 30, name: '대장초등학교',   city: '성남시', gu: '분당구', dong: '대장동'    },
];

const GYEONGGI_MIDDLE_SCHOOLS: SchoolEntry[] = [
  { rank: 1,  name: '이현중학교',     city: '용인시', gu: '수지구', dong: '풍덕천동'  },
  { rank: 2,  name: '상현중학교',     city: '용인시', gu: '수지구', dong: '상현동'    },
  { rank: 3,  name: '서원중학교',     city: '용인시', gu: '수지구', dong: '상현동'    },
  { rank: 4,  name: '정자중학교',     city: '성남시', gu: '분당구', dong: '정자동'    },
  { rank: 5,  name: '양영중학교',     city: '성남시', gu: '분당구', dong: '서현동'    },
  { rank: 6,  name: '판교중학교',     city: '성남시', gu: '분당구', dong: '판교동'    },
  { rank: 7,  name: '손곡중학교',     city: '용인시', gu: '수지구', dong: '동천동'    },
  { rank: 8,  name: '백현중학교',     city: '성남시', gu: '분당구', dong: '정자동'    },
  { rank: 9,  name: '광교중학교',     city: '수원시', gu: '영통구', dong: '이의동'    },
  { rank: 10, name: '수지중학교',     city: '용인시', gu: '수지구', dong: '풍덕천동'  },
  { rank: 11, name: '운중중학교',     city: '성남시', gu: '분당구', dong: '운중동'    },
  { rank: 12, name: '야탑중학교',     city: '성남시', gu: '분당구', dong: '야탑동'    },
  { rank: 13, name: '동백중학교',     city: '용인시', gu: '기흥구', dong: '동백동'    },
  { rank: 14, name: '매탄중학교',     city: '수원시', gu: '영통구', dong: '매탄동'    },
  { rank: 15, name: '성복중학교',     city: '용인시', gu: '수지구', dong: '성복동'    },
  { rank: 16, name: '보평중학교',     city: '성남시', gu: '분당구', dong: '판교동'    },
  { rank: 17, name: '구성중학교',     city: '용인시', gu: '기흥구', dong: '마북동'    },
  { rank: 18, name: '구미중학교',     city: '성남시', gu: '분당구', dong: '구미동'    },
  { rank: 19, name: '문원중학교',     city: '과천시', gu: '',       dong: '문원동'    },
  { rank: 20, name: '분당중학교',     city: '성남시', gu: '분당구', dong: '수내동'    },
  { rank: 21, name: '이매중학교',     city: '성남시', gu: '분당구', dong: '이매동'    },
  { rank: 22, name: '수내중학교',     city: '성남시', gu: '분당구', dong: '수내동'    },
  { rank: 23, name: '신봉중학교',     city: '용인시', gu: '수지구', dong: '신봉동'    },
  { rank: 24, name: '서현중학교',     city: '성남시', gu: '분당구', dong: '서현동'    },
  { rank: 25, name: '영통중학교',     city: '수원시', gu: '영통구', dong: '영통동'    },
  { rank: 26, name: '원천중학교',     city: '수원시', gu: '영통구', dong: '원천동'    },
  { rank: 27, name: '죽전중학교',     city: '용인시', gu: '수지구', dong: '죽전동'    },
  { rank: 28, name: '흥덕중학교',     city: '용인시', gu: '기흥구', dong: '영덕동'    },
  { rank: 29, name: '동탄중학교',     city: '화성시', gu: '동탄구', dong: '청계동'    },
  { rank: 30, name: '평촌중학교',     city: '안양시', gu: '동안구', dong: '평촌동'    },
];

const GYEONGGI_HIGH_SCHOOLS: SchoolEntry[] = [
  { rank: 1,  name: '분당중앙고등학교',   city: '성남시',   gu: '분당구', dong: '정자동'   },
  { rank: 2,  name: '서현고등학교',       city: '성남시',   gu: '분당구', dong: '서현동'   },
  { rank: 3,  name: '수지고등학교',       city: '용인시',   gu: '수지구', dong: '풍덕천동' },
  { rank: 4,  name: '상현고등학교',       city: '용인시',   gu: '수지구', dong: '상현동'   },
  { rank: 5,  name: '낙생고등학교',       city: '성남시',   gu: '분당구', dong: '판교동'   },
  { rank: 6,  name: '판교고등학교',       city: '성남시',   gu: '분당구', dong: '삼평동'   },
  { rank: 7,  name: '보정고등학교',       city: '용인시',   gu: '기흥구', dong: '보정동'   },
  { rank: 8,  name: '광교고등학교',       city: '수원시',   gu: '영통구', dong: '이의동'   },
  { rank: 9,  name: '경기과학고등학교',   city: '수원시',   gu: '장안구', dong: '송죽동'   },
  { rank: 10, name: '흥덕고등학교',       city: '용인시',   gu: '기흥구', dong: '영덕동'   },
  { rank: 11, name: '돌마고등학교',       city: '성남시',   gu: '분당구', dong: '이매동'   },
  { rank: 12, name: '수원외국어고등학교', city: '수원시',   gu: '영통구', dong: '이의동'   },
  { rank: 13, name: '경기외국어고등학교', city: '의왕시',   gu: '',       dong: '고천동'   },
  { rank: 14, name: '과천외국어고등학교', city: '과천시',   gu: '',       dong: '중앙동'   },
  { rank: 15, name: '경기북과학고등학교', city: '의정부시', gu: '',       dong: '녹양동'   },
  { rank: 16, name: '매탄고등학교',       city: '수원시',   gu: '영통구', dong: '매탄동'   },
  { rank: 17, name: '구성고등학교',       city: '용인시',   gu: '기흥구', dong: '마북동'   },
  { rank: 18, name: '죽전고등학교',       city: '용인시',   gu: '수지구', dong: '죽전동'   },
  { rank: 19, name: '운중고등학교',       city: '성남시',   gu: '분당구', dong: '운중동'   },
  { rank: 20, name: '백현고등학교',       city: '용인시',   gu: '기흥구', dong: '동백동'   },
  { rank: 21, name: '안양외국어고등학교', city: '안양시',   gu: '만안구', dong: '안양동'   },
  { rank: 22, name: '평촌고등학교',       city: '안양시',   gu: '동안구', dong: '호계동'   },
  { rank: 23, name: '동탄고등학교',       city: '화성시',   gu: '동탄구', dong: '반송동'   },
  { rank: 24, name: '효원고등학교',       city: '수원시',   gu: '영통구', dong: '매탄동'   },
  { rank: 25, name: '안양고등학교',       city: '안양시',   gu: '만안구', dong: '박달동'   },
  { rank: 26, name: '분당고등학교',       city: '성남시',   gu: '분당구', dong: '분당동'   },
  { rank: 27, name: '야탑고등학교',       city: '성남시',   gu: '분당구', dong: '야탑동'   },
  { rank: 28, name: '이매고등학교',       city: '성남시',   gu: '분당구', dong: '이매동'   },
  { rank: 29, name: '성복고등학교',       city: '용인시',   gu: '수지구', dong: '성복동'   },
  { rank: 30, name: '신봉고등학교',       city: '용인시',   gu: '수지구', dong: '신봉동'   },
];

// 특목고(과학고·외국어고·자사고) 진학률 기준 경기도 중학교
// 출처: 학교알리미 졸업생 진로현황 기반 (blog.allinfo.today) · 2024년 기준
type SpecialSchoolEntry = SchoolEntry & { rate: number };
const GYEONGGI_MIDDLE_SPECIAL_SCHOOLS: SpecialSchoolEntry[] = [
  { rank: 1,  name: '문원중학교',       city: '과천시', gu: '',       dong: '문원동',   rate: 22.19 },
  { rank: 2,  name: '범계중학교',       city: '안양시', gu: '동안구', dong: '범계동',   rate: 16.50 },
  { rank: 3,  name: '귀인중학교',       city: '안양시', gu: '동안구', dong: '귀인동',   rate: 13.55 },
  { rank: 4,  name: '서원중학교',       city: '용인시', gu: '수지구', dong: '상현동',   rate: 11.45 },
  { rank: 5,  name: '과천중학교',       city: '과천시', gu: '',       dong: '별양동',   rate: 11.36 },
  { rank: 6,  name: '이현중학교',       city: '용인시', gu: '수지구', dong: '풍덕천동', rate: 10.82 },
  { rank: 7,  name: '성복중학교',       city: '용인시', gu: '수지구', dong: '성복동',   rate: 10.68 },
  { rank: 8,  name: '용인신촌중학교',   city: '용인시', gu: '기흥구', dong: '신촌동',   rate: 10.64 },
  { rank: 9,  name: '백현중학교',       city: '성남시', gu: '분당구', dong: '정자동',   rate:  8.39 },
  { rank: 10, name: '보평중학교',       city: '성남시', gu: '분당구', dong: '판교동',   rate:  8.15 },
  { rank: 11, name: '광교중학교',       city: '수원시', gu: '영통구', dong: '이의동',   rate:  8.13 },
  { rank: 12, name: '평촌중학교',       city: '안양시', gu: '동안구', dong: '평촌동',   rate:  8.10 },
  { rank: 13, name: '운중중학교',       city: '성남시', gu: '분당구', dong: '운중동',   rate:  8.02 },
  { rank: 14, name: '양영중학교',       city: '성남시', gu: '분당구', dong: '서현동',   rate:  7.84 },
  { rank: 15, name: '이매중학교',       city: '성남시', gu: '분당구', dong: '이매동',   rate:  7.10 },
  { rank: 16, name: '수내중학교',       city: '성남시', gu: '분당구', dong: '수내동',   rate:  6.85 },
  { rank: 17, name: '수지중학교',       city: '용인시', gu: '수지구', dong: '풍덕천동', rate:  6.25 },
  { rank: 18, name: '신봉중학교',       city: '용인시', gu: '수지구', dong: '신봉동',   rate:  5.70 },
  { rank: 19, name: '상현중학교',       city: '용인시', gu: '수지구', dong: '상현동',   rate:  5.41 },
  { rank: 20, name: '동백중학교',       city: '용인시', gu: '기흥구', dong: '동백동',   rate:  5.39 },
  { rank: 21, name: '서현중학교',       city: '성남시', gu: '분당구', dong: '서현동',   rate:  4.83 },
  { rank: 22, name: '흥덕중학교',       city: '용인시', gu: '기흥구', dong: '영덕동',   rate:  4.66 },
  { rank: 23, name: '구성중학교',       city: '용인시', gu: '기흥구', dong: '마북동',   rate:  4.35 },
  { rank: 24, name: '분당중학교',       city: '성남시', gu: '분당구', dong: '수내동',   rate:  3.73 },
  { rank: 25, name: '동탄중학교',       city: '화성시', gu: '동탄구', dong: '청계동',   rate:  3.42 },
  { rank: 26, name: '판교중학교',       city: '성남시', gu: '분당구', dong: '판교동',   rate:  3.31 },
  { rank: 27, name: '손곡중학교',       city: '용인시', gu: '수지구', dong: '동천동',   rate:  1.84 },
  { rank: 28, name: '야탑중학교',       city: '성남시', gu: '분당구', dong: '야탑동',   rate:  1.10 },
];

// ─── 양도세율 정적 데이터 ───────────────────────────────────────────────────
const TAX_RATE_SERIES = [
  {
    label: '단기(1년 미만)',
    color: '#ef4444',
    data: [
      { year: 2015, value: 40 }, { year: 2016, value: 40 }, { year: 2017, value: 40 },
      { year: 2018, value: 40 }, { year: 2019, value: 40 }, { year: 2020, value: 50 },
      { year: 2021, value: 70 }, { year: 2022, value: 70 }, { year: 2023, value: 70 },
      { year: 2024, value: 70 }, { year: 2025, value: 70 }, { year: 2026, value: 70 },
    ],
  },
  {
    label: '다주택 중과',
    color: '#f97316',
    data: [
      { year: 2015, value: 0 }, { year: 2016, value: 0 }, { year: 2017, value: 0 },
      { year: 2018, value: 10 }, { year: 2019, value: 10 }, { year: 2020, value: 10 },
      { year: 2021, value: 20 }, { year: 2022, value: 0 }, { year: 2023, value: 0 },
      { year: 2024, value: 0 }, { year: 2025, value: 0 }, { year: 2026, value: 20 },
    ],
  },
  {
    label: '1주택 최고세율',
    color: '#3b82f6',
    data: [
      { year: 2015, value: 38 }, { year: 2016, value: 38 }, { year: 2017, value: 40 },
      { year: 2018, value: 42 }, { year: 2019, value: 42 }, { year: 2020, value: 42 },
      { year: 2021, value: 45 }, { year: 2022, value: 45 }, { year: 2023, value: 45 },
      { year: 2024, value: 45 }, { year: 2025, value: 45 }, { year: 2026, value: 45 },
    ],
  },
] as const;

const TAX_HISTORY = [
  { year: '2017', event: '8.2 대책', detail: '다주택자 양도세 중과 예고, 투기과열지구 지정 확대' },
  { year: '2018', event: '다주택 중과 시행', detail: '조정지역 2주택 +10%p, 3주택+ +20%p 중과 시행' },
  { year: '2020', event: '7.10 대책', detail: '다주택 중과 강화 예고: 2주택 +20%p, 3주택+ +30%p (2021.6.1 시행)' },
  { year: '2021', event: '단기세율 강화', detail: '1년 미만 70%, 1~2년 60%로 상향. 다주택 중과 +20/+30%p 시행' },
  { year: '2021', event: '소득세 최고세율 인상', detail: '과세표준 10억 초과 구간 신설, 최고세율 42%→45%' },
  { year: '2022', event: '다주택 중과 배제', detail: '2022.5.10부터 다주택자 중과세 한시 배제 (1년)' },
  { year: '2023', event: '중과 배제 연장', detail: '다주택자 한시 배제 1년 추가 연장 (2024.5까지)' },
  { year: '2024', event: '중과 배제 재연장', detail: '한시 배제 재차 연장 (2026.5까지), 세제 개편 방향 논의 중' },
  { year: '2026', event: '중과 재개', detail: '2026.5.10부터 다주택자 중과 재개. 2주택 +20%p, 3주택+ +30%p 적용' },
  { year: '2026', event: '세제개편안 발표', detail: '중과세율 단계적 완화(2027~2029), 장기보유특별공제→장기거주소득공제 전환 예고' },
] as const;

const TaxLineChart: React.FC = React.memo(() => {
  const LEFT_AXIS = 34;
  const CHART_H = 160;
  const CHART_W = width - 64 - LEFT_AXIS;
  const Y_MAX = 80;
  const years = TAX_RATE_SERIES[0].data.map(d => d.year);
  const n = years.length;

  const getX = (i: number) => (i / (n - 1)) * CHART_W;
  const getY = (v: number) => CHART_H - (v / Y_MAX) * CHART_H;
  const yTicks = [0, 20, 40, 60, 80];

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_AXIS, height: CHART_H }}>
          {yTicks.map(tick => (
            <Text key={tick} style={{ position: 'absolute', top: getY(tick) - 7, right: 4, fontSize: 9, color: '#8e8e8e' }}>
              {tick}%
            </Text>
          ))}
        </View>
        <View style={{ width: CHART_W, height: CHART_H }}>
          {yTicks.map(tick => (
            <View key={tick} style={{ position: 'absolute', top: getY(tick), left: 0, right: 0, height: 1, backgroundColor: tick === 0 ? '#8e8e8e' : '#dbdbdb' }} />
          ))}
          {TAX_RATE_SERIES.map(series => {
            const pts = series.data.map((d, i) => ({ x: getX(i), y: getY(d.value) }));
            return (
              <View key={series.label} style={{ position: 'absolute', width: CHART_W, height: CHART_H }}>
                {pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1];
                  const dx = q.x - p.x;
                  const dy = q.y - p.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx);
                  return (
                    <View key={i} style={{ position: 'absolute', width: len, height: 2, left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, backgroundColor: series.color, transform: [{ rotate: `${angle}rad` }] }} />
                  );
                })}
                {pts.map((p, i) => (
                  <View key={i} style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: series.color, left: p.x - 3, top: p.y - 3 }} />
                ))}
              </View>
            );
          })}
          {years.map((year, i) => (
            <Text key={year} style={{ position: 'absolute', top: CHART_H + 4, left: getX(i) - 12, width: 24, textAlign: 'center', fontSize: 8, color: '#8e8e8e' }}>
              {`'${String(year).slice(2)}`}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ height: 20 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        {TAX_RATE_SERIES.map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 16, height: 2.5, backgroundColor: s.color, borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const TaxHistoryTable: React.FC = React.memo(() => (
  <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
    <View style={{ flexDirection: 'row', backgroundColor: '#fafafa', paddingVertical: 7, paddingHorizontal: 10 }}>
      <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>연도</Text>
      <Text style={{ width: 88, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>정책/변화</Text>
      <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>내용</Text>
    </View>
    {TAX_HISTORY.map((row, idx) => (
      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff', borderTopWidth: 1, borderTopColor: '#fafafa' }}>
        <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>{row.year}</Text>
        <Text style={{ width: 88, fontSize: 11, fontWeight: '600', color: '#262626' }}>{row.event}</Text>
        <Text style={{ flex: 1, fontSize: 11, color: '#8e8e8e', lineHeight: 16 }}>{row.detail}</Text>
      </View>
    ))}
  </View>
));

const TaxPolicySummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 16, backgroundColor: '#fafafa', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0095f6' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#0095f6" />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0095f6' }}>최근 양도세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#262626', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#8e8e8e', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
  </View>
));

const JongbuseSummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 12, backgroundColor: '#fafafa', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0095f6' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#0095f6" />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0095f6' }}>최근 종합부동산세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#262626', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#8e8e8e', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
  </View>
));

const CapitalGainsTaxSection: React.FC<{
  taxPolicySummary?: { text: string; updatedAt: string } | null;
  jongbuseSummary?: { text: string; updatedAt: string } | null;
}> = React.memo(({ taxPolicySummary, jongbuseSummary }) => (
  <View style={[styles.detailSection]}>
    <Text style={styles.detailSectionTitle}>연도별 양도세율 추이 (2015~2026)</Text>
    <TaxLineChart />
    <Text style={[styles.chartUnit, { textAlign: 'left', marginTop: 2 }]}>
      단기: 조정지역 기준 · 다주택: 2주택 조정지역 추가세율 · 1주택: 소득세 최고세율
    </Text>
    <Text style={[styles.detailSectionTitle, { marginTop: 20, paddingTop: 0, borderBottomWidth: 0, marginBottom: 0 }]}>
      주요 세제 변화 이력
    </Text>
    <TaxHistoryTable />
    <Text style={[styles.chartUnit, { marginTop: 6 }]}>
      ※ 현행 다주택 중과(2022.5~)는 한시 배제 중 · 세율은 지방세 별도
    </Text>
    {taxPolicySummary && <TaxPolicySummaryCard summary={taxPolicySummary} />}
    {jongbuseSummary && <JongbuseSummaryCard summary={jongbuseSummary} />}
  </View>
));

const BarChart: React.FC<{
  data: { label: string; value: number }[];
  title: string;
  unit: string;
}> = React.memo(({ data, title, unit }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.chartBody}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{max.toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>
        <View style={styles.barChart}>
          {data.map((point, idx) => (
            <View key={idx} style={styles.barColumn}>
              <Text style={styles.barValue}>{point.value.toLocaleString()}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max((point.value / max) * 100, 4)}%` },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{point.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.chartUnit}>{unit}</Text>
    </View>
  );
});

const HorizontalBarChart: React.FC<{
  data: { label: string; sub?: string; value: number; note?: string }[];
  title: string;
  unit: string;
  color?: string;
  valueSuffix?: string;
  decimals?: number;
}> = React.memo(({ data, title, unit, color = '#0095f6', valueSuffix = '', decimals = 1 }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.chartTitle}>{title}</Text>
      {sorted.map((d, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 76 }}>
            <Text style={{ fontSize: 11, color: '#262626', fontWeight: '600' }} numberOfLines={1}>{d.label}</Text>
            {d.sub ? <Text style={{ fontSize: 9, color: '#8e8e8e' }} numberOfLines={1}>{d.sub}</Text> : null}
          </View>
          <View style={{ flex: 1, height: 16, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 6 }}>
            <View style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
          </View>
          <View style={{ width: 56, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: '#262626', fontWeight: '600', textAlign: 'right' }}>
              {d.value.toFixed(decimals)}{valueSuffix}
            </Text>
            {d.note ? <Text style={{ fontSize: 8, color: '#8e8e8e' }} numberOfLines={1}>{d.note}</Text> : null}
          </View>
        </View>
      ))}
      <Text style={styles.chartUnit}>{unit}</Text>
    </View>
  );
});

const stripCite = (text: string): string =>
  text ? text.replace(/<cite[^>]*>|<\/cite>/g, '') : text;

const isBoxPlotData = (
  data: NonNullable<InvestmentColumn['chartData']>[number]['data'] | null | undefined
): data is BoxPlotPoint[] => Array.isArray(data) && data.length > 0 && 'median' in data[0];

const TRACK_BOTTOM_Y = 112; // 트랙 하단의 container 상단 기준 y (px, 근사치)
const TRACK_H = 80;
const COL_W = 48;
const CONTAINER_H = 140;

const BoxPlotChart: React.FC<{
  data: BoxPlotPoint[];
  yearlyData?: BoxPlotPoint[];
  title: string;
  unit: string;
}> = React.memo(({ data, yearlyData, title, unit }) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [expanded, setExpanded] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const hasYearly = !!yearlyData && yearlyData.length > 0;
  const points = viewMode === 'yearly' && hasYearly ? yearlyData : data;

  const allOutliers = points.flatMap(p => p.outliers ?? []);
  const globalMax = Math.max(...points.map(d => d.max), ...allOutliers, 1);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / globalMax) * 100));

  const openFullscreen = async () => {
    setExpanded(true);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  };

  const closeFullscreen = async () => {
    setExpanded(false);
    await ScreenOrientation.unlockAsync();
  };

  const Y_AXIS_W = 46;
  const fsLandscapeW = Math.max(winW, winH);
  const fsColWidth = Math.max(30, Math.floor((fsLandscapeW - Y_AXIS_W - 40) / points.length));

  const renderBoxColumns = (colW: number, trackH: number) =>
    points.map((point, idx) => {
      const trackW = Math.max(16, Math.floor(colW * 0.5));
      const labelFontSize = Math.min(10, Math.floor(colW * 0.22));
      return (
        <View key={idx} style={{ width: colW, alignItems: 'center' }}>
          <Text style={[styles.barValue, { fontSize: labelFontSize }]}>{point.avg.toLocaleString()}</Text>
          <View style={{ width: trackW, height: trackH, position: 'relative' }}>
            <View style={[styles.boxWhisker, { bottom: `${pct(point.min)}%`, height: `${Math.max(pct(point.max) - pct(point.min), 1)}%` }]} />
            <View style={[styles.boxRect, { bottom: `${pct(point.q1)}%`, height: `${Math.max(pct(point.q3) - pct(point.q1), 3)}%` }]} />
            <View style={[styles.boxMedian, { bottom: `${pct(point.median)}%` }]} />
            <View style={[styles.boxAvgDot, { bottom: `${pct(point.avg)}%` }]} />
            {(point.outliers ?? []).map((val, oi) => (
              <View key={`o${oi}`} style={[styles.boxOutlierDot, { bottom: `${pct(val)}%` }]} />
            ))}
          </View>
          <Text style={[styles.barLabel, { fontSize: labelFontSize }]}>{point.label}</Text>
          <Text style={[styles.boxRangeLabel, { fontSize: Math.max(7, labelFontSize - 2) }]}>{point.min}~{point.max}</Text>
        </View>
      );
    });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[styles.chartTitle, { marginBottom: 0, flex: 1 }]}>{title}</Text>
        <TouchableOpacity onPress={openFullscreen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="open-in-full" size={18} color="#8e8e8e" />
        </TouchableOpacity>
      </View>

      {hasYearly && (
        <View style={styles.viewModeRow}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'monthly' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('monthly')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'monthly' && styles.viewModeButtonTextActive]}>월별</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'yearly' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('yearly')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'yearly' && styles.viewModeButtonTextActive]}>연도별</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.chartBody}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{globalMax.toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.75).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.5).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.25).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.hChartScroll}>
          <View style={{ position: 'relative' }}>
            <View style={styles.hBarChart}>
              {points.map((point, idx) => (
                <View key={idx} style={styles.hBarColumn}>
                  <Text style={styles.barValue}>{point.avg.toLocaleString()}</Text>
                  <View style={styles.boxPlotTrack}>
                    <View
                      style={[
                        styles.boxWhisker,
                        {
                          bottom: `${pct(point.min)}%`,
                          height: `${Math.max(pct(point.max) - pct(point.min), 1)}%`,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.boxRect,
                        {
                          bottom: `${pct(point.q1)}%`,
                          height: `${Math.max(pct(point.q3) - pct(point.q1), 3)}%`,
                        },
                      ]}
                    />
                    <View style={[styles.boxMedian, { bottom: `${pct(point.median)}%` }]} />
                    <View style={[styles.boxAvgDot, { bottom: `${pct(point.avg)}%` }]} />
                    {(point.outliers ?? []).map((val, oi) => (
                      <View key={`o${oi}`} style={[styles.boxOutlierDot, { bottom: `${pct(val)}%` }]} />
                    ))}
                  </View>
                  <Text style={styles.barLabel}>{point.label}</Text>
                  <Text style={styles.boxRangeLabel}>{point.min}~{point.max}</Text>
                </View>
              ))}
            </View>
            {/* 가격 그리드라인 (25%, 50%, 75%) */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CONTAINER_H }}>
              {[0.25, 0.5, 0.75].map(frac => (
                <View key={frac} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: TRACK_BOTTOM_Y - frac * TRACK_H,
                  height: 0.5, backgroundColor: '#dbdbdb', opacity: 0.7,
                }} />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <Text style={styles.chartUnit}>
        {unit} · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균
      </Text>

      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={[styles.bpTableRow, { backgroundColor: '#fafafa' }]}>
            <View style={styles.bpTableLabelCell}><Text style={styles.bpTableHeader}>기간</Text></View>
            <View style={styles.bpTableCell}><Text style={styles.bpTableHeader}>최소</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#3b82f6' }]}>Q1</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#1d4ed8' }]}>중앙값</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#f97316' }]}>평균</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#3b82f6' }]}>Q3</Text></View>
            <View style={styles.bpTableCell}><Text style={styles.bpTableHeader}>최대</Text></View>
          </View>
          {/* 데이터 행 */}
          {points.map((p, idx) => (
            <View key={idx} style={[styles.bpTableRow, idx % 2 === 1 && styles.bpTableRowAlt]}>
              <View style={styles.bpTableLabelCell}><Text style={styles.bpTableLabelText}>{p.label}</Text></View>
              <View style={styles.bpTableCell}><Text style={styles.bpTableText}>{p.min.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#0095f6' }]}>{p.q1.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { fontWeight: '600', color: '#1d4ed8' }]}>{p.median.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#f97316' }]}>{p.avg.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#0095f6' }]}>{p.q3.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={styles.bpTableText}>{p.max.toLocaleString()}</Text></View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={expanded} statusBarTranslucent animationType="fade" onRequestClose={closeFullscreen}>
        <View style={styles.fsContainer}>
          <View style={styles.fsHeader}>
            <Text style={styles.fsTitle}>{title}</Text>
            {hasYearly && (
              <View style={[styles.viewModeRow, { marginBottom: 0, marginLeft: 14 }]}>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'monthly' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('monthly')}
                >
                  <Text style={[styles.viewModeButtonText, viewMode === 'monthly' && styles.viewModeButtonTextActive]}>월별</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'yearly' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('yearly')}
                >
                  <Text style={[styles.viewModeButtonText, viewMode === 'yearly' && styles.viewModeButtonTextActive]}>연도별</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={closeFullscreen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="fullscreen-exit" size={24} color="#8e8e8e" />
            </TouchableOpacity>
          </View>

          <View style={[styles.chartBody, { flex: 1, alignItems: 'center' }]}>
            <View style={[styles.yAxis, { height: 160, marginTop: 0, alignSelf: 'center' }]}>
              <Text style={styles.yAxisLabel}>{globalMax.toLocaleString()}</Text>
              <Text style={styles.yAxisLabel}>0</Text>
            </View>
            <View style={[styles.hBarChart, { flex: 1, height: 160, paddingTop: 0, justifyContent: 'space-around' }]}>
              {renderBoxColumns(fsColWidth, 100)}
            </View>
          </View>

          <Text style={[styles.chartUnit, { textAlign: 'left', paddingLeft: Y_AXIS_W + 8 }]}>
            {unit} · 위: 평균 · 아래: 최소~최대 · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균
          </Text>
        </View>
      </Modal>
    </View>
  );
});

const TERM_CATEGORY_COLORS: Record<string, string> = {
  금융정책: '#0095f6',
  부동산세제: '#0095f6',
  청약제도: '#059669',
  대출규제: '#dc2626',
  시장분석: '#d97706',
};

const TermOfDayCard: React.FC<{ term: DailyTerm }> = React.memo(({ term }) => {
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const tagColor = TERM_CATEGORY_COLORS[term.category] ?? '#8e8e8e';

  const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
  const storageKey = `term_done_${today}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => { if (v === 'true') setDone(true); });
  }, [storageKey]);

  const handleComplete = async () => {
    if (done) return;
    setDone(true);
    await AsyncStorage.setItem(storageKey, 'true');
    const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
    if (user?.uid) dbSet(userRef(user.uid, `completion/investment/${today}`), true).catch(() => {});
    ToastAndroid.show('✅ 용어 학습 완료!', ToastAndroid.SHORT);
  };

  return (
    <TouchableOpacity
      style={styles.termCard}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      <View style={styles.termHeader}>
        <View style={styles.termHeaderLeft}>
          <MaterialIcons name="menu-book" size={18} color="#0095f6" />
          <Text style={styles.termSectionLabel}>오늘의 부동산 용어</Text>
        </View>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
          color="#8e8e8e"
        />
      </View>

      <View style={styles.termTitleRow}>
        <Text style={styles.termName}>{term.term}</Text>
        <View style={[styles.termCategoryBadge, { backgroundColor: tagColor }]}>
          <Text style={styles.termCategoryText}>{term.category}</Text>
        </View>
      </View>

      {term.fullName !== term.term && (
        <Text style={styles.termFullName}>{term.fullName}</Text>
      )}

      <Text style={styles.termDefinition} numberOfLines={expanded ? undefined : 2}>
        {stripCite(term.definition)}
      </Text>

      {expanded && (
        <>
          <View style={styles.termDetailRow}>
            <MaterialIcons name="lightbulb-outline" size={14} color="#f59e0b" />
            <Text style={styles.termDetailLabel}>예시</Text>
          </View>
          <Text style={styles.termDetailText}>{stripCite(term.example)}</Text>

          <View style={styles.termDetailRow}>
            <MaterialIcons name="account-balance" size={14} color="#0095f6" />
            <Text style={styles.termDetailLabel}>관련 정책</Text>
          </View>
          <Text style={styles.termDetailText}>{stripCite(term.relatedPolicy)}</Text>

          <View style={[styles.termTipBox]}>
            <MaterialIcons name="stars" size={14} color="#0095f6" />
            <Text style={styles.termTipText}>{stripCite(term.tip)}</Text>
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.termCompleteBtn, done && styles.termCompleteBtnDone]}
        onPress={(e) => { e.stopPropagation?.(); handleComplete(); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.termCompleteBtnText, done && styles.termCompleteBtnTextDone]}>
          {done ? '✅ 학습 완료' : '완료'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  'real-estate': '부동산',
  stocks: '주식',
  economy: '경제',
};
const NEWS_CATEGORY_COLORS: Record<string, string> = {
  'real-estate': '#8b5cf6',
  stocks: '#06b6d4',
  economy: '#f59e0b',
};

const NewsCard: React.FC<{ articles: NewsArticle[] }> = React.memo(({ articles }) => {
  if (!articles.length) return null;

  return (
    <View style={styles.newsSection}>
      <View style={styles.newsSectionHeader}>
        <MaterialIcons name="newspaper" size={18} color="#0095f6" />
        <Text style={styles.newsSectionLabel}>뉴스 큐레이션</Text>
      </View>
      {articles.map(article => (
        <View key={article.id} style={styles.newsArticleCard}>
          <View style={styles.newsArticleHeader}>
            <View
              style={[
                styles.newsCategoryBadge,
                { backgroundColor: NEWS_CATEGORY_COLORS[article.category] ?? '#8e8e8e' },
              ]}
            >
              <Text style={styles.newsCategoryText}>
                {NEWS_CATEGORY_LABELS[article.category] ?? article.category}
              </Text>
            </View>
            <Text style={styles.newsSourceText}>{article.source}</Text>
          </View>
          <Text style={styles.newsTitle}>{article.title}</Text>
          <Text style={styles.newsSummary}>{stripCite(article.summary)}</Text>
        </View>
      ))}
    </View>
  );
});

// 여러 지역/차트가 있을 때 칩으로 하나씩 골라서 보는 선택형 UI.
// 항목이 1개뿐이면 칩 없이 그 차트만 바로 보여준다.
const ChartSelector: React.FC<{
  charts: NonNullable<InvestmentColumn['chartData']>;
}> = React.memo(({ charts }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const renderChart = (chart: NonNullable<InvestmentColumn['chartData']>[number]) => {
    if (!Array.isArray(chart.data) || chart.data.length === 0) return null;
    return isBoxPlotData(chart.data) ? (
      <BoxPlotChart data={chart.data} yearlyData={chart.yearlyData} title={chart.title} unit={chart.unit} />
    ) : (
      <BarChart data={chart.data as { label: string; value: number }[]} title={chart.title} unit={chart.unit} />
    );
  };

  if (charts.length === 1) {
    return renderChart(charts[0]);
  }

  const selected = charts[selectedIndex];

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartChipRow}
      >
        {charts.map((chart, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.chartChip,
              idx === selectedIndex && styles.chartChipActive,
            ]}
            onPress={() => setSelectedIndex(idx)}
          >
            <Text
              style={[
                styles.chartChipText,
                idx === selectedIndex && styles.chartChipTextActive,
              ]}
            >
              {chart.area}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {renderChart(selected)}
    </View>
  );
});

const AREA_ADMIN_MAP: Record<string, { adminName: string; parentSi?: string; ratio: number }> = {
  '판교':       { adminName: '분당구',   parentSi: '성남시',  ratio: 27.4 },
  '분당':       { adminName: '분당구',   parentSi: '성남시',  ratio: 27.4 },
  '광교':       { adminName: '영통구',   parentSi: '수원시',  ratio: 24.1 },
  '수원 영통':  { adminName: '영통구',   parentSi: '수원시',  ratio: 24.1 },
  '수원 권선':  { adminName: '권선구',   parentSi: '수원시',  ratio: 23.1 },
  '기흥':       { adminName: '기흥구',   parentSi: '용인시',  ratio: 25.4 },
  '수지':       { adminName: '수지구',   parentSi: '용인시',  ratio: 27.5 },
  '용인(처인)': { adminName: '처인구',   parentSi: '용인시',  ratio: 24.3 },
  '과천':       { adminName: '과천시',                        ratio: 26.0 },
  '성남':       { adminName: '성남시',                        ratio: 25.1 },
  '용인':       { adminName: '용인시',                        ratio: 25.8 },
  '동탄':       { adminName: '화성시',                        ratio: 23.9 },
  '안산':       { adminName: '안산시',                        ratio: 23.9 },
  '평택':       { adminName: '평택시',                        ratio: 25.7 },
  '김포':       { adminName: '김포시',                        ratio: 24.1 },
  '시흥':       { adminName: '시흥시',                        ratio: 22.7 },
  '하남':       { adminName: '하남시',                        ratio: 20.2 },
  '오산':       { adminName: '오산시',                        ratio: 21.2 },
  '의정부':     { adminName: '의정부시',                      ratio: 22.1 },
  '남양주':     { adminName: '남양주시',                      ratio: 24.6 },
  '구리':       { adminName: '구리시',                        ratio: 23.4 },
  '부천':       { adminName: '부천시',                        ratio: 22.9 },
};

type AreaChip = { name: string; parent?: string; ratio: number };
type RatioCategory = '전체' | '성남' | '수원' | '용인' | '기타';

const RATIO_CATEGORIES: Record<RatioCategory, string[]> = {
  전체: [],
  성남: ['성남시', '분당구'],
  수원: ['영통구', '권선구'],
  용인: ['용인시', '수지구', '기흥구', '처인구'],
  기타: ['과천시', '화성시', '안산시', '평택시', '김포시', '시흥시', '하남시', '오산시', '의정부시', '남양주시', '구리시', '부천시'],
};

const ALL_AREA_CHIPS: AreaChip[] = Object.values(
  Object.fromEntries(
    Object.values(AREA_ADMIN_MAP).map(a => [a.adminName, { name: a.adminName, parent: a.parentSi, ratio: a.ratio }])
  )
).sort((a, b) => b.ratio - a.ratio);

const MultiOwnerRatioChips: React.FC<{ areaKey: string }> = React.memo(({ areaKey }) => {
  const highlightName = AREA_ADMIN_MAP[areaKey]?.adminName;

  const defaultCat = (): RatioCategory => {
    if (!highlightName) return '전체';
    for (const [cat, names] of Object.entries(RATIO_CATEGORIES) as [RatioCategory, string[]][]) {
      if (cat !== '전체' && names.includes(highlightName)) return cat;
    }
    return '기타';
  };

  const [cat, setCat] = useState<RatioCategory>(defaultCat);

  const items = cat === '전체'
    ? ALL_AREA_CHIPS
    : ALL_AREA_CHIPS.filter(c => RATIO_CATEGORIES[cat].includes(c.name));

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#262626' }}>2주택자 이상 비율 비교</Text>
        <Text style={{ fontSize: 10, color: '#8e8e8e' }}>KOSIS 2024년 · 비율순</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(Object.keys(RATIO_CATEGORIES) as RatioCategory[]).map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setCat(c)}
              style={{
                paddingVertical: 5, paddingHorizontal: 13, borderRadius: 14,
                backgroundColor: cat === c ? '#0095f6' : '#fafafa',
                borderWidth: 1, borderColor: cat === c ? '#0095f6' : '#dbdbdb',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: cat === c ? '#fff' : '#8e8e8e' }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(item => {
          const isHighlight = item.name === highlightName;
          return (
            <View
              key={item.name}
              style={{
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14,
                backgroundColor: isHighlight ? '#fff7ed' : '#fafafa',
                borderWidth: 1, borderColor: isHighlight ? '#f97316' : '#dbdbdb',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: isHighlight ? '700' : '400', color: isHighlight ? '#ea580c' : '#8e8e8e' }}>
                {item.name} {item.ratio}%
              </Text>
              {item.parent && (
                <Text style={{ fontSize: 9, color: '#dbdbdb', marginTop: 1 }}>{item.parent}</Text>
              )}
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 8 }}>출처: 통계청 주택소유통계 · 주황: 현재 지역</Text>
    </View>
  );
});

const DongChartViewer: React.FC<{ entry: DongChartEntry }> = React.memo(({ entry }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected: DongEntry = entry.dongs[selectedIndex];
  const areaKey = entry.title.split(' 동별')[0];

  if (!selected) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartChipRow}
      >
        {entry.dongs.map((dong, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.chartChip, idx === selectedIndex && styles.chartChipActive]}
            onPress={() => setSelectedIndex(idx)}
          >
            <Text style={[styles.chartChipText, idx === selectedIndex && styles.chartChipTextActive]}>
              {dong.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <BoxPlotChart
        data={selected.data}
        yearlyData={selected.yearlyData}
        title={`${entry.title.split(' ')[0]} ${selected.name} 실거래가`}
        unit={entry.unit}
      />
      <MultiOwnerRatioChips areaKey={areaKey} />
    </View>
  );
});

// 경기도 시 표시 순서 (구 수 많은 시 우선)
const SI_ORDER = [
  '수원시', '성남시', '용인시', '고양시', '안양시', '안산시',
  '화성시', '부천시', '의정부시', '남양주시', '광명시', '평택시',
  '김포시', '시흥시', '하남시', '구리시', '오산시', '군포시',
  '의왕시', '파주시', '이천시', '광주시', '양주시', '과천시',
];

const REGION_BOOKMARKS_KEY = 'region_bookmarks_v2';
const REGION_FILTER_KEY   = 'region_filter_state_v1';

interface RegionBookmark {
  area: string;
  si: string;
  label: string;
  dongName?: string;
  displayLabel: string;
}

// 2026년 7월 기준 중앙값 6억~8억 동 (중앙값 오름차순)
const DEFAULT_REGION_BOOKMARKS: RegionBookmark[] = [];

const REGION_RATIO_LABELS = ["'16","'17","'18","'19","'20","'21","'22","'23","'24"];

// KOSIS 주택소유통계 (시군구 단위) - 2주택 이상 소유 가구 비율 (%)
// 출처: 통계청 KOSIS Open API DT_1OH0407, 2026-08-07 조회
// 출처: 통계청 KOSIS Open API DT_1OH0407, 2026-08-09 실측 (fetch_multi_owner_ratio.py)
const REGION_RATIO_DATA: Record<string, number[]> = {
  '수원_장안':   [23.8, 24.3, 24.8, 25.2, 24.8, 24.2, 24.4, 24.6, 24.4],
  '수원_권선':   [22.6, 23.4, 24.0, 23.9, 23.5, 22.6, 22.9, 23.2, 23.1],
  '수원_팔달':   [24.5, 25.0, 25.4, 24.9, 24.2, 22.9, 22.6, 23.7, 23.6],
  '수원_영통':   [25.0, 25.8, 26.9, 28.5, 28.0, 25.5, 24.9, 24.3, 24.1],
  '성남_수정':   [24.2, 24.6, 24.7, 24.7, 24.3, 23.5, 23.0, 22.3, 23.1],
  '성남_중원':   [23.7, 23.6, 22.8, 22.8, 21.9, 21.4, 21.0, 21.4, 21.5],
  '성남_분당':   [30.9, 31.3, 31.1, 31.0, 29.7, 27.6, 27.3, 27.2, 27.4],
  '의정부':      [23.7, 23.6, 23.5, 24.1, 23.3, 22.0, 21.8, 21.9, 22.1],
  '안양_만안':   [24.9, 25.8, 26.2, 26.2, 25.8, 24.2, 23.5, 24.1, 24.0],
  '안양_동안':   [27.1, 27.6, 28.0, 28.3, 27.4, 25.6, 25.5, 25.5, 25.4],
  '부천':        [24.0, 24.1, 24.1, 24.2, 24.1, 22.8, 22.5, 22.7, 22.9],
  '광명':        [26.0, 26.4, 26.8, 26.8, 26.3, 24.6, 24.6, 25.0, 24.7],
  '평택':        [27.7, 27.8, 29.6, 30.1, 29.6, 26.8, 26.0, 25.6, 25.7],
  '안산_상록':   [22.8, 22.8, 22.7, 23.6, 24.4, 23.0, 22.5, 22.6, 23.0],
  '안산_단원':   [24.2, 24.0, 24.6, 25.5, 26.5, 24.4, 24.0, 24.4, 24.8],
  '고양_덕양':   [25.0, 24.9, 24.9, 24.8, 23.8, 22.4, 22.0, 22.0, 21.8],
  '고양_일산동':  [27.4, 27.5, 27.7, 27.8, 27.2, 26.0, 25.6, 25.8, 26.1], // KOSIS SGG 코드 오류, 추정치 유지
  '고양_일산서':  [27.7, 27.7, 27.8, 27.5, 27.6, 26.7, 26.5, 26.4, 24.8],
  '과천':        [34.0, 32.7, 31.8, 31.5, 30.9, 29.9, 27.9, 26.2, 26.0],
  '구리':        [24.4, 24.8, 24.8, 24.5, 23.9, 22.6, 22.5, 22.8, 23.4],
  '남양주':      [27.5, 26.7, 26.9, 26.8, 26.0, 24.9, 24.6, 24.5, 24.6],
  '오산':        [22.8, 23.3, 24.2, 24.3, 24.0, 21.9, 21.5, 21.5, 21.2],
  '시흥':        [22.8, 22.8, 23.8, 24.3, 24.2, 23.4, 22.7, 23.1, 22.7],
  '군포':        [24.8, 25.4, 25.9, 26.1, 26.3, 24.0, 23.6, 24.0, 24.2],
  '의왕':        [27.9, 27.9, 28.3, 28.2, 28.7, 26.0, 26.3, 26.6, 26.3],
  '하남':        [22.7, 23.5, 23.3, 24.1, 23.5, 20.6, 19.6, 19.7, 20.2],
  '용인_처인':   [27.3, 26.0, 27.0, 27.8, 26.6, 25.2, 24.2, 24.2, 24.3],
  '용인_기흥':   [28.0, 28.1, 28.2, 28.8, 27.8, 25.7, 25.1, 25.1, 25.4],
  '용인_수지':   [31.7, 31.5, 31.5, 31.7, 31.3, 28.9, 27.8, 27.7, 27.5],
  '파주':        [26.9, 26.3, 26.1, 26.3, 25.8, 25.2, 25.1, 24.8, 24.5],
  '이천':        [28.2, 28.6, 28.3, 28.6, 28.2, 27.1, 26.8, 26.9, 26.7],
  '김포':        [26.4, 26.3, 26.3, 26.6, 25.5, 24.9, 24.4, 24.3, 24.1],
  '화성_동탄':   [26.6, 26.9, 27.0, 28.8, 27.5, 25.2, 24.9, 24.4, 23.9],
  '화성_본청':   [26.6, 26.9, 27.0, 28.8, 27.5, 25.2, 24.9, 24.4, 23.9],
  '광주':        [25.2, 25.0, 25.3, 25.3, 24.1, 22.6, 21.9, 22.0, 22.0],
  '양주':        [23.8, 25.7, 25.4, 25.7, 24.0, 22.6, 22.8, 24.2, 23.3],
};

const RATIO_CHART_W = width - 56; // regionSection: marginH 12*2 + padding 16*2
const RATIO_CHART_H = 64;

const RegionRatioChart: React.FC<{ area: string }> = React.memo(({ area }) => {
  const vals = REGION_RATIO_DATA[area];
  if (!vals) return null;

  const n = vals.length;
  const minV = Math.floor(Math.min(...vals) - 1);
  const maxV = Math.ceil(Math.max(...vals) + 1);
  const PAD_H = 8;
  const getX = (i: number) => PAD_H + (i / (n - 1)) * (RATIO_CHART_W - PAD_H * 2);
  const getY = (v: number) => RATIO_CHART_H - ((v - minV) / (maxV - minV)) * RATIO_CHART_H;
  const pts = vals.map((v, i) => ({ x: getX(i), y: getY(v) }));

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#262626' }}>2주택 이상 보유 비율</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#0095f6' }}>{vals[n - 1]}%</Text>
          <Text style={{ fontSize: 9, color: '#8e8e8e' }}>2024년</Text>
        </View>
      </View>
      <View style={{ height: RATIO_CHART_H + 16, width: RATIO_CHART_W, overflow: 'hidden' }}>
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View key={i} style={{ position: 'absolute', width: len, height: 2, left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, backgroundColor: '#93c5fd', transform: [{ rotate: `${angle}rad` }] }} />
          );
        })}
        {pts.map((p, i) => {
          const isLast = i === n - 1;
          const sz = isLast ? 7 : 5;
          return (
            <View key={i} style={{ position: 'absolute', width: sz, height: sz, borderRadius: sz / 2, backgroundColor: isLast ? '#0095f6' : '#bfdbfe', left: p.x - sz / 2, top: p.y - sz / 2 }} />
          );
        })}
        {REGION_RATIO_LABELS.map((lbl, i) => (
          <Text key={i} style={{ position: 'absolute', fontSize: 8, color: '#8e8e8e', top: RATIO_CHART_H + 2, left: getX(i) - 10, width: 20, textAlign: 'center' }}>{lbl}</Text>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 2 }}>출처: 통계청 KOSIS 주택소유통계 · 시군구 단위 · 데이터 없는 지역은 미표시</Text>
    </View>
  );
});

const JeonseRatioChart: React.FC<{ points: { label: string; value: number }[] }> = React.memo(({ points }) => {
  if (points.length < 2) return null;

  const n = points.length;
  const vals = points.map(p => p.value);
  const minV = Math.floor(Math.min(...vals) - 1);
  const maxV = Math.ceil(Math.max(...vals) + 1);
  const PAD_H = 8;
  const getX = (i: number) => PAD_H + (i / (n - 1)) * (RATIO_CHART_W - PAD_H * 2);
  const getY = (v: number) => RATIO_CHART_H - ((v - minV) / (maxV - minV || 1)) * RATIO_CHART_H;
  const pts = vals.map((v, i) => ({ x: getX(i), y: getY(v) }));

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#262626' }}>전세가율 (최근 12개월)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#10b981' }}>{vals[n - 1]}%</Text>
          <Text style={{ fontSize: 9, color: '#8e8e8e' }}>{points[n - 1].label}</Text>
        </View>
      </View>
      <View style={{ height: RATIO_CHART_H + 16, width: RATIO_CHART_W, overflow: 'hidden' }}>
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View key={i} style={{ position: 'absolute', width: len, height: 2, left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, backgroundColor: '#6ee7b7', transform: [{ rotate: `${angle}rad` }] }} />
          );
        })}
        {pts.map((p, i) => {
          const isLast = i === n - 1;
          const sz = isLast ? 7 : 5;
          return (
            <View key={i} style={{ position: 'absolute', width: sz, height: sz, borderRadius: sz / 2, backgroundColor: isLast ? '#10b981' : '#a7f3d0', left: p.x - sz / 2, top: p.y - sz / 2 }} />
          );
        })}
        {points.map((p, i) => (
          <Text key={i} style={{ position: 'absolute', fontSize: 8, color: '#8e8e8e', top: RATIO_CHART_H + 2, left: getX(i) - 10, width: 20, textAlign: 'center' }}>{p.label}</Text>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 2 }}>전세가율 = 순수 전세 실거래 중앙값 / 매매 실거래 중앙값 × 100 · 국토부 실거래가 기준</Text>
    </View>
  );
});

type RegionViewMode = 'series' | 'compare';

const RegionBrowser: React.FC<{ regionCharts: RegionChartEntry[] }> = React.memo(({ regionCharts }) => {
  const [viewMode, setViewMode] = useState<RegionViewMode>('series');
  const { user } = useAuth();

  // ── 즐겨찾기 (두 모드 공통 보조 기능) ──
  const [bookmarks, setBookmarks] = useState<RegionBookmark[]>([]);

  useEffect(() => {
    const loadBookmarks = async () => {
      if (user?.uid) {
        try {
          const db = getDatabase(getFirebaseApp());
          const snap = await get(ref(db, `users/${user.uid}/regionBookmarks`));
          if (snap.exists()) {
            const val = snap.val();
            const arr: RegionBookmark[] = Array.isArray(val) ? val : Object.values(val);
            setBookmarks(arr);
            await AsyncStorage.setItem(REGION_BOOKMARKS_KEY, JSON.stringify(arr));
            return;
          }
        } catch {}
      }
      // Firebase 없거나 로그인 안 됨 → AsyncStorage 폴백
      const v = await AsyncStorage.getItem(REGION_BOOKMARKS_KEY);
      const local: RegionBookmark[] = v ? JSON.parse(v) : DEFAULT_REGION_BOOKMARKS;
      setBookmarks(local);
      // 로컬에 데이터 있으면 Firebase에 백업
      if (user?.uid && local.length > 0) {
        const db = getDatabase(getFirebaseApp());
        dbSet(ref(db, `users/${user.uid}/regionBookmarks`), local).catch(() => {});
      }
    };
    loadBookmarks();
  }, [user?.uid]);

  const saveBookmarks = useCallback(async (next: RegionBookmark[]) => {
    setBookmarks(next);
    await AsyncStorage.setItem(REGION_BOOKMARKS_KEY, JSON.stringify(next));
    if (user?.uid) {
      const db = getDatabase(getFirebaseApp());
      dbSet(ref(db, `users/${user.uid}/regionBookmarks`), next).catch(() => {});
    }
  }, [user?.uid]);

  const isBookmarked = useCallback((area: string, dongName?: string) =>
    bookmarks.some(b => b.area === area && b.dongName === dongName),
  [bookmarks]);

  // ── 시계열 모드 상태 ──
  const siList = useMemo(() => {
    const available = new Set(regionCharts.map(r => r.si));
    return SI_ORDER.filter(si => available.has(si));
  }, [regionCharts]);

  const [selectedSi, setSelectedSi] = useState<string>(() => siList[0] ?? '');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedDong, setSelectedDong] = useState<string | null>(null);

  // 복원 시 area/dong을 정확히 재현하기 위한 ref (selectedSi effect가 덮어쓰기 전에 적용)
  const pendingAreaRef = useRef<string | null>(null);
  const pendingDongRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingAreaRef.current !== null) {
      const area = pendingAreaRef.current;
      const dong = pendingDongRef.current;
      pendingAreaRef.current = null;
      pendingDongRef.current = null;
      const valid = regionCharts.find(r => r.area === area && r.si === selectedSi);
      if (valid) { setSelectedArea(area); setSelectedDong(dong); return; }
    }
    const first = regionCharts.find(r => r.si === selectedSi);
    setSelectedArea(first?.area ?? null);
    setSelectedDong(null);
  }, [selectedSi, regionCharts]);

  const handleAreaSelect = useCallback((area: string) => {
    setSelectedArea(area);
    setSelectedDong(null);
  }, []);

  const guList = useMemo(() => regionCharts.filter(r => r.si === selectedSi), [regionCharts, selectedSi]);
  const selectedEntry = useMemo(() => regionCharts.find(r => r.area === selectedArea) ?? null, [regionCharts, selectedArea]);
  const dongList = useMemo(() => selectedEntry?.dongs ?? [], [selectedEntry]);
  const showGuRow = guList.length > 1;

  const seriesData = useMemo(() => {
    if (!selectedEntry) return null;
    if (selectedDong) {
      const dong = selectedEntry.dongs.find(d => d.name === selectedDong);
      if (dong) return { data: dong.data, yearlyData: dong.yearlyData, title: `${selectedEntry.label} ${selectedDong}`, unit: selectedEntry.unit };
    }
    return { data: selectedEntry.data, yearlyData: selectedEntry.yearlyData, title: selectedEntry.title, unit: selectedEntry.unit };
  }, [selectedEntry, selectedDong]);

  const starred = selectedEntry ? isBookmarked(selectedEntry.area, selectedDong ?? undefined) : false;

  const toggleBookmark = useCallback(() => {
    if (!selectedEntry) return;
    const dong = selectedDong ?? undefined;
    const displayLabel = dong
      ? `${selectedEntry.si} ${selectedEntry.label} ${dong}`
      : `${selectedEntry.si} ${selectedEntry.label}`;
    const bm: RegionBookmark = { area: selectedEntry.area, si: selectedEntry.si, label: selectedEntry.label, dongName: dong, displayLabel };
    if (isBookmarked(selectedEntry.area, dong)) {
      saveBookmarks(bookmarks.filter(b => !(b.area === selectedEntry.area && b.dongName === dong)));
    } else {
      saveBookmarks([...bookmarks, bm]);
    }
  }, [selectedEntry, selectedDong, bookmarks, isBookmarked, saveBookmarks]);

  const resetSeries = useCallback(() => {
    const firstSi = siList[0] ?? '';
    setSelectedSi(firstSi);
    setSelectedDong(null);
    // selectedArea는 selectedSi effect가 자동으로 첫 번째로 설정함
  }, [siList]);

  // ── 숨김 동 (area별 동 이름 목록) ──
  const [hiddenDongs, setHiddenDongs] = useState<Record<string, string[]>>({});

  const toggleHiddenDong = useCallback((area: string, dongName: string) => {
    setHiddenDongs(prev => {
      const list = prev[area] ?? [];
      return {
        ...prev,
        [area]: list.includes(dongName) ? list.filter(d => d !== dongName) : [...list, dongName],
      };
    });
  }, []);

  const hiddenDongListForArea = useMemo(
    () => (selectedArea ? (hiddenDongs[selectedArea] ?? []) : []),
    [hiddenDongs, selectedArea]
  );

  const visibleDongList = useMemo(
    () => dongList.filter(d => !hiddenDongListForArea.includes(d.name)),
    [dongList, hiddenDongListForArea]
  );

  const restoreHiddenDongsInArea = useCallback(() => {
    if (!selectedArea) return;
    setHiddenDongs(prev => ({ ...prev, [selectedArea]: [] }));
  }, [selectedArea]);

  // 숨긴 동이 선택된 경우 전체(null)로 fallback
  useEffect(() => {
    if (selectedDong && selectedArea && (hiddenDongs[selectedArea] ?? []).includes(selectedDong)) {
      setSelectedDong(null);
    }
  }, [hiddenDongs]);

  // ── 차트 로딩 표시 ──
  const [isChartLoading, setIsChartLoading] = useState(false);
  const chartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedArea) return;
    setIsChartLoading(true);
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    chartTimerRef.current = setTimeout(() => setIsChartLoading(false), 300);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [selectedArea, selectedDong]);

  // ── 비교 모드 상태 ──
  const [compareDongs, setCompareDongs] = useState<{ area: string; dongName: string; si: string; label?: string }[]>([]);
  const [compareMetric, setCompareMetric] = useState<'price' | 'ratio' | 'turnover' | 'largeComplex' | 'jeonse'>('price');

  const toggleCompareDong = useCallback((area: string, dongName: string, si: string) => {
    setCompareDongs(prev => {
      const exists = prev.some(d => d.area === area && d.dongName === dongName);
      return exists
        ? prev.filter(d => !(d.area === area && d.dongName === dongName))
        : [...prev, { area, dongName, si }];
    });
  }, []);

  const loadFavoritesIntoCompare = useCallback(() => {
    const pairs = bookmarks
      .filter(b => b.dongName)
      .map(b => {
        // si + dongName으로 정확한 area 키 매핑 (오매핑 0%)
        const validArea = regionCharts.some(r => r.area === b.area)
          ? b.area
          : (regionCharts.find(r => r.si === b.si && r.dongs.some(d => d.name === b.dongName))?.area ?? b.area);
        const entry = regionCharts.find(r => r.area === validArea);
        const label = entry ? (entry.gu ?? entry.si.replace('시', '')) : b.label;
        return { area: validArea, dongName: b.dongName!, si: b.si, label };
      });
    setCompareDongs(prev => {
      const existing = new Set(prev.map(d => `${d.area}__${d.dongName}`));
      const toAdd = pairs.filter(p => !existing.has(`${p.area}__${p.dongName}`));
      return [...prev, ...toAdd];
    });
  }, [bookmarks, regionCharts]);

  const resetCompare = useCallback(() => setCompareDongs([]), []);


  useEffect(() => {
    if (compareDongs.length === 0) return;
    setIsChartLoading(true);
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    chartTimerRef.current = setTimeout(() => setIsChartLoading(false), 350);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [compareDongs]);

  // 동별 최신 중위가 가로 바 차트 데이터
  const compareDongBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      if (!entry) return [];
      const dong = entry.dongs.find(d => d.name === dongName);
      if (!dong || dong.data.length === 0) return [];
      const latest = dong.data[dong.data.length - 1];
      const shortArea = entry.gu ?? entry.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: latest.median }];
    });
  }, [compareDongs, regionCharts]);

  // 동별 연간 거래 회전율 (%) = 최근 12개월 실거래건수 / 총세대수 × 100
  // dong.data는 이미 MONTHLY_WINDOW=12개월로 제한돼 있으므로 전체 합산이 곧 실측 연간 거래건수.
  // (예전엔 6개월×2로 추정했는데, 계절성을 무시하는 가정이라 12개월 실측으로 전환 - 추가 API 호출 없음)
  // dongUnitCounts 없는 동은 제외 (부정확한 데이터 미표시)
  const compareTurnoverBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      if (!entry?.dongUnitCounts) return [];
      const totalUnits = entry.dongUnitCounts[dongName];
      if (!totalUnits || totalUnits === 0) return [];
      const dong = entry.dongs.find(d => d.name === dongName);
      if (!dong || dong.data.length === 0) return [];
      const trades12m = dong.data.reduce((s, p) => s + (p.count ?? 0), 0);
      if (trades12m === 0) return [];
      const annualRate = Math.round((trades12m / totalUnits) * 1000) / 10; // 소수 1자리
      const shortArea = entry.gu ?? entry.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: annualRate, note: `${trades12m}건` }];
    });
  }, [compareDongs, regionCharts]);

  // 동별 대단지(1000세대 이상) 비율(%) - 세대수 기준
  // dongLargeComplexRatio 없는 동은 제외 (단지 정보 없는 동 미표시). 표본(단지 개수)은 숨기지 않고 note로 같이 노출
  // - 단지 1~2개짜리 동은 0%/100%로 극단값이 나오기 쉬운데, 그게 노이즈가 아니라 "원래 단지가 적다"는
  //   사실 그대로라 값 자체를 걸러내진 않되, 사용자가 신뢰도를 판단할 수 있게 단지 개수를 보여줌
  const compareLargeComplexBarData = useMemo<{ label: string; sub: string; value: number; note: string }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      const ratio = entry?.dongLargeComplexRatio?.[dongName];
      if (ratio === undefined) return [];
      const complexCount = entry?.dongComplexCount?.[dongName];
      const shortArea = entry!.gu ?? entry!.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: ratio, note: complexCount ? `단지 ${complexCount}개` : '' }];
    });
  }, [compareDongs, regionCharts]);

  // 동별 전세가율(%) - dongJeonseRatio 없는 동(전세 거래 자체가 없던 동)은 제외.
  // 표본이 적다고 값을 숨기진 않고, 전세 거래건수를 note로 같이 보여줘서 신뢰도를 사용자가 판단하게 함
  const compareJeonseBarData = useMemo<{ label: string; sub: string; value: number; note: string }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      const ratio = entry?.dongJeonseRatio?.[dongName];
      if (ratio === undefined) return [];
      const tradeCount = entry?.dongJeonseTradeCount?.[dongName];
      const shortArea = entry!.gu ?? entry!.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: ratio, note: tradeCount ? `전세 ${tradeCount}건` : '' }];
    });
  }, [compareDongs, regionCharts]);

  // 구별 다주택자 비율 가로 바 차트 데이터 (area 기준 중복 제거)
  // regionCharts에 없는 지역(거래 데이터 없음)도 KOSIS 비율 데이터가 있으면 표시
  const compareRatioBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    const seen = new Set<string>();
    return compareDongs.flatMap(({ area, si, label: dongLabel }) => {
      if (seen.has(area)) return [];
      seen.add(area);
      const vals = REGION_RATIO_DATA[area];
      if (!vals) return [];
      const entry = regionCharts.find(r => r.area === area);
      const displayLabel = entry ? (entry.gu ?? entry.si.replace('시', '')) : (dongLabel ?? area);
      const displaySi = entry?.si ?? si ?? '';
      return [{ label: displayLabel, sub: displaySi, value: vals[vals.length - 1] }];
    });
  }, [compareDongs, regionCharts]);

  // ── 필터 상태 저장/복원 ──
  const hydratedRef = useRef(false);

  // regionCharts가 처음 로드될 때 한 번 복원
  useEffect(() => {
    if (hydratedRef.current || regionCharts.length === 0) return;
    hydratedRef.current = true;
    AsyncStorage.getItem(REGION_FILTER_KEY).then(v => {
      if (!v) return;
      try {
        const s = JSON.parse(v);
        if (s.viewMode === 'series' || s.viewMode === 'compare') setViewMode(s.viewMode);
        if (Array.isArray(s.compareDongs)) {
          // area 키가 깨진 경우 si + dongName으로 재매핑 (si 없으면 dongName만)
          const remapped = s.compareDongs.map(({ area, dongName, si, label }: { area: string; dongName: string; si?: string; label?: string }) => {
            if (regionCharts.some(r => r.area === area)) {
              const entry = regionCharts.find(r => r.area === area);
              const entryLabel = entry ? (entry.gu ?? entry.si.replace('시', '')) : label;
              return { area, dongName, si: si ?? entry?.si ?? '', label: entryLabel };
            }
            const match = si
              ? (regionCharts.find(r => r.si === si && r.dongs.some(d => d.name === dongName))
                  ?? regionCharts.find(r => r.dongs.some(d => d.name === dongName)))
              : regionCharts.find(r => r.dongs.some(d => d.name === dongName));
            const matchLabel = match ? (match.gu ?? match.si.replace('시', '')) : label;
            return { area: match?.area ?? area, dongName, si: match?.si ?? si ?? '', label: matchLabel };
          });
          setCompareDongs(remapped);
        }
        if (s.hiddenDongs && typeof s.hiddenDongs === 'object') {
          setHiddenDongs(s.hiddenDongs);
        }
        if (s.selectedSi && regionCharts.some(r => r.si === s.selectedSi)) {
          pendingAreaRef.current = s.selectedArea ?? null;
          pendingDongRef.current = s.selectedDong ?? null;
          setSelectedSi(s.selectedSi);
        }
      } catch {}
    });
  }, [regionCharts]);

  // 필터 변경 시 자동 저장 (복원 완료 후에만)
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(REGION_FILTER_KEY, JSON.stringify({
      viewMode, selectedSi, selectedArea, selectedDong, compareDongs, hiddenDongs,
    }));
  }, [viewMode, selectedSi, selectedArea, selectedDong, compareDongs, hiddenDongs]);

  if (siList.length === 0) return null;

  return (
    <View style={styles.regionSection}>
      <Text style={[styles.regionTitle, { marginBottom: 10 }]}>경기도 지역별 실거래가</Text>

      {/* 모드 탭 */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {([
          { key: 'series',  label: '시계열' },
          { key: 'compare', label: `지역 비교${compareDongs.length > 0 ? ` (${compareDongs.length})` : ''}` },
        ] as { key: RegionViewMode; label: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setViewMode(tab.key)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
              backgroundColor: viewMode === tab.key ? '#0095f6' : '#fafafa',
              borderWidth: 1, borderColor: viewMode === tab.key ? '#0095f6' : '#dbdbdb',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: viewMode === tab.key ? '#fff' : '#8e8e8e' }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'series' ? (
        /* ══ 시계열 모드 ══ */
        <View>
          {/* 시 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {siList.map(si => (
                  <TouchableOpacity key={si} onPress={() => setSelectedSi(si)}
                    style={[styles.regionSiChip, selectedSi === si && styles.regionSiChipActive]}>
                    <Text style={[styles.regionSiChipText, selectedSi === si && styles.regionSiChipTextActive]}>{si}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {selectedSi !== siList[0] && (
              <TouchableOpacity onPress={() => setSelectedSi(siList[0] ?? '')}
                style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 구 (구 있는 시만) */}
          {showGuRow && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {guList.map(r => (
                    <TouchableOpacity key={r.area} onPress={() => handleAreaSelect(r.area)}
                      style={[styles.regionGuChip, selectedArea === r.area && styles.regionGuChipActive]}>
                      <Text style={[styles.regionGuChipText, selectedArea === r.area && styles.regionGuChipTextActive]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {selectedArea !== guList[0]?.area && (
                <TouchableOpacity onPress={() => handleAreaSelect(guList[0]?.area ?? '')}
                  style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 동 */}
          {dongList.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setSelectedDong(null)}
                    style={[styles.regionDongChip, selectedDong === null && styles.regionDongChipActive]}>
                    <Text style={[styles.regionDongChipText, selectedDong === null && styles.regionDongChipTextActive]}>전체</Text>
                  </TouchableOpacity>
                  {visibleDongList.map(d => (
                    <TouchableOpacity key={d.name} onPress={() => setSelectedDong(d.name)}
                      style={[styles.regionDongChip, selectedDong === d.name && styles.regionDongChipActive]}>
                      <Text style={[styles.regionDongChipText, selectedDong === d.name && styles.regionDongChipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {hiddenDongListForArea.length > 0 && (
                    <TouchableOpacity onPress={restoreHiddenDongsInArea}
                      style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                      <Text style={{ fontSize: 10, color: '#8e8e8e' }}>숨김 {hiddenDongListForArea.length}개 복원</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
              {selectedDong !== null && (
                <TouchableOpacity onPress={() => setSelectedDong(null)}
                  style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {seriesData && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <TouchableOpacity onPress={toggleBookmark} style={[styles.regionStarBtn, { marginBottom: 0, flex: 1 }]}>
                  <Text style={[styles.regionStarBtnText, starred && styles.regionStarBtnTextActive]}>
                    {starred ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 추가'}
                  </Text>
                </TouchableOpacity>
                {selectedDong && selectedArea && (
                  <TouchableOpacity onPress={() => toggleHiddenDong(selectedArea, selectedDong)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                    <Text style={{ fontSize: 12, color: '#8e8e8e', fontWeight: '600' }}>숨김</Text>
                  </TouchableOpacity>
                )}
              </View>
              {isChartLoading ? (
                <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#0095f6" />
                  <Text style={{ fontSize: 12, color: '#8e8e8e' }}>차트 로딩 중...</Text>
                </View>
              ) : (
                <>
                  <BoxPlotChart data={seriesData.data} yearlyData={seriesData.yearlyData}
                    title={seriesData.title} unit={seriesData.unit} />
                  {selectedEntry && <RegionRatioChart area={selectedEntry.area} />}
                  {selectedEntry?.jeonseRatioData && <JeonseRatioChart points={selectedEntry.jeonseRatioData} />}
                </>
              )}
            </View>
          )}
        </View>

      ) : (
        /* ══ 지역 비교 모드 ══ */
        <View>
          {/* 즐겨찾기 불러오기 + 해제 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity onPress={loadFavoritesIntoCompare}
              style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#e7f5ff', borderWidth: 1, borderColor: '#bfdbfe' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1d4ed8' }}>★ 즐겨찾기 불러오기</Text>
            </TouchableOpacity>
            {compareDongs.length > 0 && (
              <TouchableOpacity onPress={resetCompare}
                style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626' }}>해제</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 선택된 동 태그 */}
          {compareDongs.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {compareDongs.map(({ area, dongName, si }) => {
                const entry = regionCharts.find(r => r.area === area);
                const areaLabel = entry ? (entry.gu ?? entry.si.replace('시', '')) : area;
                return (
                  <TouchableOpacity key={`${area}__${dongName}`}
                    onPress={() => toggleCompareDong(area, dongName, si)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e7f5ff', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ fontSize: 11, color: '#0095f6', fontWeight: '600' }}>{dongName} <Text style={{ color: '#8e8e8e', fontWeight: '400' }}>{areaLabel}</Text></Text>
                    <Text style={{ fontSize: 10, color: '#8e8e8e' }}>✕</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* 서브탭: 아파트 가격 / 다주택자 비율 / 거래 활발도 / 대단지 비율 / 전세가율 */}
          {compareDongs.length >= 2 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {([
                { key: 'price',        label: '아파트 가격' },
                { key: 'ratio',        label: '다주택자 비율' },
                { key: 'turnover',     label: '거래 활발도' },
                { key: 'largeComplex', label: '대단지 비율' },
                { key: 'jeonse',       label: '전세가율' },
              ] as { key: 'price' | 'ratio' | 'turnover' | 'largeComplex' | 'jeonse'; label: string }[]).map(tab => (
                <TouchableOpacity key={tab.key} onPress={() => setCompareMetric(tab.key)}
                  style={{ minWidth: '31%', flexGrow: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
                    backgroundColor: compareMetric === tab.key ? '#0095f6' : '#fafafa',
                    borderWidth: 1, borderColor: compareMetric === tab.key ? '#0095f6' : '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: compareMetric === tab.key ? '#fff' : '#8e8e8e' }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 차트 */}
          {isChartLoading && compareDongs.length >= 2 ? (
            <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#0095f6" />
              <Text style={{ fontSize: 12, color: '#8e8e8e' }}>차트 로딩 중...</Text>
            </View>
          ) : compareMetric === 'price' && compareDongBarData.length >= 2 ? (
            <HorizontalBarChart
              data={compareDongBarData}
              title={`동별 최신 중위가 (${compareDongBarData.length}개)`}
              unit="단위: 억원 · 최근 거래 기준"
              color="#0095f6"
            />
          ) : compareMetric === 'ratio' && compareRatioBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareRatioBarData}
              title="2주택 이상 보유 비율"
              unit="출처: 통계청 KOSIS 2024년 · 시군구 단위"
              color="#f59e0b"
              valueSuffix="%"
            />
          ) : compareMetric === 'turnover' && compareTurnoverBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareTurnoverBarData}
              title="동별 연간 거래 회전율 (최근 12개월 실거래 / 총세대수)"
              unit="단위: % · 국토부 실거래가 + 공동주택 현황 · 값 옆 숫자는 12개월 거래건수"
              color="#10b981"
              valueSuffix="%"
            />
          ) : compareMetric === 'largeComplex' && compareLargeComplexBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareLargeComplexBarData}
              title="동별 대단지 비율 (1,000세대 이상 단지 세대수 기준)"
              unit="단위: % · 국토부 공동주택 기본정보 · 값 옆 숫자는 단지 개수"
              color="#8b5cf6"
              valueSuffix="%"
            />
          ) : compareMetric === 'jeonse' && compareJeonseBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareJeonseBarData}
              title="동별 전세가율 (최근 12개월 전세/매매 중앙값)"
              unit="단위: % · 국토부 실거래가 · 값 옆 숫자는 전세 표본 건수"
              color="#10b981"
              valueSuffix="%"
            />
          ) : compareMetric === 'jeonse' ? (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Text style={{ fontSize: 13, color: '#8e8e8e' }}>선택한 동에 전세 거래 표본이 부족해 표시할 수 없어요</Text>
            </View>
          ) : compareMetric === 'turnover' ? (
            <View style={{ paddingVertical: 20, paddingHorizontal: 4, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#262626' }}>거래 회전율</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>준비 중</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#8e8e8e', lineHeight: 18 }}>
                {'연간 거래 회전율 = 거래건수 / 총 아파트 세대수 × 100%\n환금성(얼마나 쉽게 팔리는지)을 수치로 비교합니다.'}
              </Text>
              <View style={{ backgroundColor: '#fafafa', borderRadius: 8, padding: 12, gap: 6, borderWidth: 1, borderColor: '#dbdbdb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#262626' }}>데이터 준비 방법</Text>
                <Text style={{ fontSize: 11, color: '#8e8e8e', lineHeight: 17 }}>
                  {'1. stat.molit.go.kr → 주택 → 공동주택 현황 Excel 다운로드\n2. 파일 경로를 Claude에 알려주면 자동 처리\n3. push_region_charts.py 재실행으로 Firebase 업로드'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Text style={{ fontSize: 13, color: '#8e8e8e' }}>
                {compareDongs.length === 0 ? '즐겨찾기를 불러온 뒤 2개 이상 선택하세요' : '동을 1개 더 선택하세요'}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

interface ColumnCardProps {
  column: InvestmentColumn;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onPress: () => void;
}

const ColumnCard: React.FC<ColumnCardProps> = React.memo(
  ({
    column,
    isBookmarked,
    onToggleBookmark,
    onPress,
  }) => {
    const getCategoryLabel = useCallback((category: string) => {
      return category === 'real-estate' ? '부동산' : '주식';
    }, []);

    const getCategoryColor = useCallback((category: string) => {
      return category === 'real-estate' ? '#8b5cf6' : '#06b6d4';
    }, []);

    const getOutlookIcon = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return 'trending-up';
        case 'negative':
          return 'trending-down';
        default:
          return 'trending-flat';
      }
    }, []);

    const getOutlookColor = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return '#10b981';
        case 'negative':
          return '#ef4444';
        default:
          return '#f59e0b';
      }
    }, []);

    const formatDate = useCallback((dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }, []);

  return (
    <TouchableOpacity style={styles.columnCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.columnHeader}>
        <View style={styles.columnMeta}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: getCategoryColor(column.category) },
            ]}
          >
            <Text style={styles.categoryLabel}>{getCategoryLabel(column.category)}</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(column.date)}</Text>
        </View>
        <TouchableOpacity
          style={styles.bookmarkButton}
          onPress={onToggleBookmark}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name={isBookmarked ? 'bookmark' : 'bookmark-border'}
            size={24}
            color={isBookmarked ? '#f59e0b' : '#dbdbdb'}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.columnTitle} numberOfLines={2}>
        {column.title}
      </Text>

      <View style={styles.columnInfo}>
        <View style={styles.authorInfo}>
          <MaterialIcons name="person" size={14} color="#8e8e8e" />
          <View style={styles.authorDetails}>
            <Text style={styles.authorName}>{column.author}</Text>
            <Text style={styles.authorTitle}>{column.authorTitle}</Text>
          </View>
        </View>
        <View style={styles.outlookBadge}>
          <MaterialIcons
            name={getOutlookIcon(column.outlook)}
            size={14}
            color={getOutlookColor(column.outlook)}
          />
          <Text style={[styles.outlookText, { color: getOutlookColor(column.outlook) }]}>
            {column.outlook === 'positive' ? '긍정' : column.outlook === 'negative' ? '부정' : '중립'}
          </Text>
        </View>
      </View>

      <Text style={styles.columnSummary} numberOfLines={2}>
        {stripCite(column.summary)}
      </Text>

      <View style={styles.columnFooter}>
        <Text style={styles.readTime}>약 {column.readTime}분 읽음</Text>
        <MaterialIcons name="chevron-right" size={20} color="#dbdbdb" />
      </View>
    </TouchableOpacity>
    );
  },
  (prev, next) => {
    return (
      prev.column.id === next.column.id &&
      prev.isBookmarked === next.isBookmarked
    );
  }
);

interface DetailModalProps {
  column: InvestmentColumn | null;
  visible: boolean;
  onClose: () => void;
  dongCharts: DongChartEntry[];
  taxPolicySummary?: { text: string; updatedAt: string } | null;
  jongbuseSummary?: { text: string; updatedAt: string } | null;
  newsArticles: NewsArticle[];
}

const DetailModal: React.FC<DetailModalProps> = React.memo(
  ({ column, visible, onClose, dongCharts, taxPolicySummary, jongbuseSummary, newsArticles }) => {
    const { user } = useAuth();
    const getCategoryLabel = useCallback((category: string) => {
      return category === 'real-estate'
        ? '부동산 분석'
        : '주식 시장 분석';
    }, []);

    const getOutlookKorean = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return '긍정';
        case 'negative':
          return '부정';
        default:
          return '중립';
      }
    }, []);

    const formatDate = useCallback((dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }, []);

    if (!column) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#262626" />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{getCategoryLabel(column.category)}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailMeta}>
            <Text style={styles.detailDate}>{formatDate(column.date)}</Text>
            <Text style={styles.detailReadTime}>약 {column.readTime}분 읽음</Text>
          </View>

          <Text style={styles.detailColumnTitle}>{column.title}</Text>

          <View style={styles.detailAuthor}>
            <MaterialIcons name="person" size={16} color="#0095f6" />
            <View>
              <Text style={styles.detailAuthorName}>{column.author}</Text>
              <Text style={styles.detailAuthorTitle}>{column.authorTitle}</Text>
            </View>
          </View>

          {column.category === 'stocks' && (
            <>
              <View style={styles.detailStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>전망</Text>
                  <Text style={styles.statValue}>{getOutlookKorean(column.outlook)}</Text>
                </View>
                {column.ticker && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>티커</Text>
                    <Text style={styles.statValue}>{column.ticker}</Text>
                  </View>
                )}
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>개요</Text>
                <Text style={styles.detailSectionContent}>{column.summary}</Text>
              </View>
            </>
          )}

          {column.chartData && column.chartData.length > 0 && (
            <View style={styles.detailSection}>
              <ChartSelector key={column.id} charts={column.chartData} />
            </View>
          )}

          {dongCharts.length > 0 && column.category === 'real-estate' && dongCharts.map((dongEntry, idx) => (
            <View key={idx} style={styles.detailSection}>
              <DongChartViewer entry={dongEntry} />
            </View>
          ))}

          {column.category === 'real-estate' && <CapitalGainsTaxSection taxPolicySummary={taxPolicySummary} jongbuseSummary={jongbuseSummary} />}

          {column.category === 'real-estate' && <NewsCard articles={newsArticles} />}

          {column.category === 'stocks' && column.sections?.map((section, idx) => (
            <View key={idx} style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{section.heading}</Text>
              <Text style={styles.detailSectionContent}>{stripCite(section.body)}</Text>
            </View>
          ))}

          {column.source && (
            <Text style={styles.detailSource}>출처: {column.source}</Text>
          )}

          <TouchableOpacity
            style={styles.readCompleteButton}
            onPress={() => {
              const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
              if (user?.uid) dbSet(userRef(user.uid, `completion/investment/${today}`), true).catch(() => {});
              onClose();
            }}
          >
            <MaterialIcons name="check-circle" size={18} color="#fff" />
            <Text style={styles.readCompleteButtonText}>읽기 완료</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  }
);

interface FilterModalProps {
  visible: boolean;
  selectedCategory: 'all' | 'real-estate' | 'stocks';
  onClose: () => void;
  onSelectCategory: (category: 'all' | 'real-estate' | 'stocks') => void;
}

const FilterModal: React.FC<FilterModalProps> = React.memo(
  ({
    visible,
    selectedCategory,
    onClose,
    onSelectCategory,
  }) => {
    const categories = useMemo(
      () => [
        { id: 'all', label: '모든 분석' },
        { id: 'real-estate', label: '부동산 트렌드' },
        { id: 'stocks', label: '주식 분석' },
      ],
      []
    );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.filterContainer}>
        <View style={styles.filterHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#262626" />
          </TouchableOpacity>
          <Text style={styles.filterTitle}>분석 필터</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.filterContent}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>카테고리 선택</Text>
            <View style={styles.filterOptions}>
              {categories.map(category => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.filterOption,
                    selectedCategory === category.id && styles.filterOptionActive,
                  ]}
                  onPress={() => {
                    onSelectCategory(category.id as 'all' | 'real-estate' | 'stocks');
                    onClose();
                  }}
                >
                  <MaterialIcons
                    name={selectedCategory === category.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={24}
                    color={selectedCategory === category.id ? '#0095f6' : '#dbdbdb'}
                  />
                  <Text
                    style={[
                      styles.filterOptionText,
                      selectedCategory === category.id && styles.filterOptionTextActive,
                    ]}
                  >
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  }
);

// ── 애니메이션 공통 컴포넌트 ──────────────────────────────

// 섹션 진입 시 페이드 + 슬라이드업
const AnimatedCard: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(22)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, tension: 70, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
};

// 스프링 스케일 버튼 피드백
const PressableScale: React.FC<{
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  contentStyle?: any;
  scaleTo?: number;
}> = ({ children, onPress, style, contentStyle, scaleTo = 0.95 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: scaleTo, tension: 400, friction: 10, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, tension: 400, friction: 10, useNativeDriver: true }).start()}
      activeOpacity={1}
      style={style}
    >
      <Animated.View style={[contentStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

// 강조 텍스트 펄스
const PulseText: React.FC<{ style?: any; numberOfLines?: number; children: React.ReactNode }> = ({ style, numberOfLines, children }) => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.Text style={[style, { opacity }]} numberOfLines={numberOfLines}>{children}</Animated.Text>;
};

// 상하 부유 애니메이션 제거 — Android ScrollView에서 useNativeDriver loop transform이
// scroll gesture responder를 영구적으로 가로채는 문제로 인해 단순 wrapper로 대체
const FloatingCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View>{children}</View>
);

// 로딩 바운싱 점
const DOT_COLORS = ['#1d4ed8', '#0ea5e9', '#10b981', '#f59e0b'];
const LoadingDots: React.FC = () => {
  const anims = useRef(DOT_COLORS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const seq = DOT_COLORS.map((_, i) =>
      Animated.sequence([
        Animated.delay(i * 120),
        Animated.loop(
          Animated.sequence([
            Animated.timing(anims[i], { toValue: -18, duration: 350, useNativeDriver: true }),
            Animated.timing(anims[i], { toValue: 0, duration: 350, useNativeDriver: true }),
            Animated.delay(DOT_COLORS.length * 120),
          ])
        ),
      ])
    );
    const anim = Animated.parallel(seq);
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 50 }}>
      {DOT_COLORS.map((color, i) => (
        <Animated.View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, transform: [{ translateY: anims[i] }] }} />
      ))}
    </View>
  );
};

// 스파크 바 (진입 시 페이드+슬라이드)
const MiniSparkBars: React.FC<{
  values: number[];
  activeColor?: string;
  inactiveColor?: string;
  emptyColor?: string;
}> = ({ values, activeColor = '#0095f6', inactiveColor = '#bfdbfe', emptyColor = '#e5e7eb' }) => {
  if (!values || values.length === 0) return null;
  const maxVal = Math.max(...values, 0.001);
  const BAR_H = 14;
  const BAR_W = 5;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H, gap: 2, opacity: fadeAnim }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: v > 0 ? Math.max(2, Math.round((v / maxVal) * BAR_H)) : 2,
            backgroundColor: v === 0 ? emptyColor : (i === values.length - 1 ? activeColor : inactiveColor),
            borderRadius: 1,
          }}
        />
      ))}
    </Animated.View>
  );
};

const RegionBrowserModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  regionCharts: RegionChartEntry[];
}> = React.memo(({ visible, onClose, regionCharts }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#262626' }}>지역별 매매가 비교</Text>
          <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 2 }}>경기도 · {regionCharts.length}개 지역</Text>
        </View>
        <PressableScale onPress={onClose} contentStyle={{ padding: 4 }} scaleTo={0.85}>
          <MaterialIcons name="close" size={24} color="#262626" />
        </PressableScale>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <RegionBrowser regionCharts={regionCharts} />
      </ScrollView>
    </SafeAreaView>
  </Modal>
));

const GU_ORDER = ['수지구', '기흥구', '동탄구', '마포구', '용산구', '성동구', '영통구', '연수구(송도)'] as const;
// 통계청 가계동향조사 전체가구 분기별 월평균 경상소득 (만원/월)
const QUARTERLY_INCOME_MAN: Record<string, number> = {
  '23Q1': 486, '23Q2': 499, '23Q3': 514, '23Q4': 558,
  '24Q1': 502, '24Q2': 516, '24Q3': 531, '24Q4': 576,
  '25Q1': 520, '25Q2': 535, '25Q3': 551, '25Q4': 596,
  '26Q1': 539, '26Q2': 555, '26Q3': 572, '26Q4': 617,
};
const KHAI_RATE_DEFAULT = 4.36;

function getMonthlyIncomeMAN(monthLabel: string): number {
  const parts = monthLabel.split('.');
  if (parts.length < 2) return 520;
  const q = Math.ceil(parseInt(parts[1], 10) / 3);
  return QUARTERLY_INCOME_MAN[`${parts[0]}Q${q}`] ?? 520;
}

function computeKHAI(price억: number, ratePercent = KHAI_RATE_DEFAULT, incomeMAN = 520): number {
  if (price억 <= 0) return 0;
  const loan = price억 * 10000 * 0.7; // 70% LTV, 만원 단위
  const r = ratePercent / 100 / 12;
  const n = 240; // 20년 원리금균등
  const monthly = r > 0 ? loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : loan / n;
  return Math.round(monthly / incomeMAN * 100);
}
type GuName = typeof GU_ORDER[number];
const SUJI_DONG_NAMES = ['죽전동', '풍덕천동', '신봉동', '동천동'];

function computeDongStat(dong: string, complexes: JukjeonComplex[]) {
  if (complexes.length === 0) return null;
  const prices = [...complexes.map(c => c.medianPrice)].sort((a, b) => a - b);
  const n = prices.length, mid = Math.floor(n / 2);
  const dongMedian = n % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  const monthCount = complexes[0]?.monthlyData?.length ?? 0;
  const monthlyMedians = Array.from({ length: monthCount }, (_, mi) => {
    const mp = complexes.map(c => c.monthlyData[mi]?.median ?? 0).filter(v => v > 0).sort((a, b) => a - b);
    if (!mp.length) return 0;
    const mn = mp.length, mm = Math.floor(mn / 2);
    return mn % 2 === 1 ? mp[mm] : (mp[mm - 1] + mp[mm]) / 2;
  });
  const monthlyTradeCounts = Array.from({ length: monthCount }, (_, mi) =>
    complexes.reduce((s, c) => s + (c.monthlyData[mi]?.count ?? 0), 0)
  );
  const totalCount = monthlyTradeCounts.reduce((s, v) => s + v, 0);
  const refMonth = complexes[0]?.monthlyData[monthCount - 1]?.month ?? '';
  return { dong, dongMedian: Math.round(dongMedian * 10) / 10, monthlyMedians, monthlyTradeCounts, totalCount, refMonth };
}

const DongTableRow: React.FC<{ stat: NonNullable<ReturnType<typeof computeDongStat>>; idx: number }> = React.memo(({ stat, idx }) => {
  const half = Math.floor(stat.monthlyMedians.length / 2);
  const avg = (arr: number[]) => { const v = arr.filter(x => x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const priceFirst = avg(stat.monthlyMedians.slice(0, half));
  const priceLast = avg(stat.monthlyMedians.slice(-half));
  const countFirst = stat.monthlyTradeCounts.slice(0, half).reduce((s, v) => s + v, 0);
  const countLast = stat.monthlyTradeCounts.slice(-half).reduce((s, v) => s + v, 0);
  const isDown = priceLast < priceFirst;
  const dongColor = (priceLast > priceFirst && countLast < countFirst) ? '#ef4444'
    : (isDown && countLast > countFirst) ? '#1d4ed8'
    : isDown ? '#60a5fa'
    : '#262626';
  return (
  <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'center' }}>
    <Text style={{ width: 72, fontSize: 13, fontWeight: '500', color: dongColor }}>{stat.dong}</Text>
    <Text style={{ width: 56, fontSize: 13, fontWeight: '700', color: '#0095f6', textAlign: 'right' }}>{stat.dongMedian.toFixed(1)}억</Text>
    <View style={{ width: 68, alignItems: 'flex-end' }}>
      <MiniSparkBars values={stat.monthlyMedians} activeColor="#7c3aed" inactiveColor="#c4b5fd" />
    </View>
    <View style={{ width: 60, alignItems: 'flex-end', gap: 2 }}>
      <Text style={{ fontSize: 10, color: '#8e8e8e' }}>{stat.totalCount}건</Text>
      <MiniSparkBars values={stat.monthlyTradeCounts} />
    </View>
    <Text style={{ width: 38, fontSize: 10, color: '#8e8e8e', textAlign: 'right' }}>{stat.refMonth}</Text>
  </View>
  );
});

const GuSection: React.FC<{
  guName: GuName;
  guData: Record<string, JukjeonComplex[]>;
  isFirst: boolean;
}> = React.memo(({ guName, guData, isFirst }) => {
  const [expanded, setExpanded] = useState(true);
  const dongNames = Object.keys(guData).sort((a, b) => (guData[b][0]?.medianPrice ?? 0) - (guData[a][0]?.medianPrice ?? 0));
  const dongStats = useMemo(() =>
    dongNames.map(d => computeDongStat(d, guData[d] ?? [])).filter((d): d is NonNullable<typeof d> => d !== null),
    [guData, dongNames]
  );
  if (dongStats.length === 0) return null;

  const toggle = () => {
    setExpanded(v => !v);
  };

  return (
    <View style={{ borderTopWidth: isFirst ? 0 : 1, borderTopColor: '#f0f0f0' }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f7f7f7' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#262626' }}>{guName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{dongStats.length}개 동</Text>
          <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color="#8e8e8e" />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true}>
            <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden', minWidth: 352 }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#fafafa', paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center' }}>
                <Text style={{ width: 72, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>동</Text>
                <Text style={{ width: 56, fontSize: 11, fontWeight: '600', color: '#8e8e8e', textAlign: 'right' }}>현재가</Text>
                <View style={{ width: 68, alignItems: 'flex-end' }}><Text style={{ fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>가격추세</Text></View>
                <View style={{ width: 60, alignItems: 'flex-end' }}><Text style={{ fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>거래건수</Text></View>
                <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e', textAlign: 'right' }}>기준</Text>
              </View>
              {dongStats.map((stat, idx) => <DongTableRow key={stat.dong} stat={stat} idx={idx} />)}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
});

// ── 금리 바 차트 ──────────────────────────────────────────────────────
const RateBarChart: React.FC<{
  data: { label: string; value: number }[];
  color?: string;
  highlightColor?: string;
  showEveryN?: number;
}> = React.memo(({ data, color = '#93c5fd', highlightColor = '#1d4ed8', showEveryN = 1 }) => {
  const { width: screenW } = useWindowDimensions();
  const n = data.length;
  const GAP = 4;
  const CHART_H = 100;
  const LABEL_FONT = 9;
  const VALUE_FONT = 10;
  const availW = screenW - 64;
  const barW = Math.max(8, Math.floor((availW - GAP * (n - 1)) / n));
  const chartTotalW = barW * n + GAP * (n - 1);
  const vals = data.map(d => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 0.01;
  const MIN_BAR = 8;
  const LABEL_AREA = VALUE_FONT + 4;
  return (
    <View style={{ width: chartTotalW }}>
      <View style={{ height: CHART_H, flexDirection: 'row', alignItems: 'flex-end' }}>
        {data.map((d, i) => {
          const isLast = i === n - 1;
          const fillH = MIN_BAR + Math.round(((d.value - minV) / range) * (CHART_H - MIN_BAR - LABEL_AREA));
          return (
            <View key={i} style={{ width: barW, marginRight: i < n - 1 ? GAP : 0, alignItems: 'center', justifyContent: 'flex-end' }}>
              {isLast && (
                <Text style={{ fontSize: VALUE_FONT, color: highlightColor, fontWeight: '700', marginBottom: 2 }}>
                  {d.value.toFixed(2)}
                </Text>
              )}
              <View style={{ height: fillH, width: barW, backgroundColor: isLast ? highlightColor : color, borderRadius: 3 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 5 }}>
        {data.map((d, i) => (
          <View key={i} style={{ width: barW, marginRight: i < n - 1 ? GAP : 0 }}>
            {(i % showEveryN === 0 || i === n - 1) && (
              <Text style={{ fontSize: LABEL_FONT, color: '#6b7280', textAlign: 'center' }}>{d.label}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

// ── 금리 가로 바 차트 (월별 전용) ────────────────────────────────────
const RateHBarChart: React.FC<{
  data: { label: string; value: number }[];
  color?: string;
  highlightColor?: string;
}> = React.memo(({ data, color = '#93c5fd', highlightColor = '#1d4ed8' }) => {
  const { width: screenW } = useWindowDimensions();
  const LABEL_W = 38;
  const VALUE_W = 38;
  const H_GAP = 8;
  const BAR_H = 13;
  const ROW_GAP = 4;
  const maxBarW = screenW - 64 - LABEL_W - VALUE_W - H_GAP * 2;
  const vals = data.map(d => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 0.01;
  return (
    <View style={{ gap: ROW_GAP }}>
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        const barW = Math.max(4, Math.round(((d.value - minV) / range) * maxBarW));
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: H_GAP }}>
            <Text style={{ width: LABEL_W, fontSize: 10, color: isLast ? highlightColor : '#6b7280', textAlign: 'right', fontWeight: isLast ? '700' : '400' }}>
              {d.label}
            </Text>
            <View style={{ flex: 1, height: BAR_H, justifyContent: 'center' }}>
              <View style={{ height: BAR_H, width: barW, backgroundColor: isLast ? highlightColor : color, borderRadius: 3 }} />
            </View>
            <Text style={{ width: VALUE_W, fontSize: 10, color: isLast ? highlightColor : '#374151', fontWeight: isLast ? '700' : '400' }}>
              {d.value.toFixed(2)}%
            </Text>
          </View>
        );
      })}
    </View>
  );
});

// ── 지표분석 모달 ─────────────────────────────────────────────────────
function sdiBarColor(value: number, minV: number, maxV: number): string {
  if (value <= 90) {
    // 낮을수록 진파랑, 90에 가까울수록 연파랑
    const t = Math.min(1, (value - minV) / Math.max(0.1, 90 - minV));
    const r = Math.round(30 + (191 - 30) * t);
    const g = Math.round(64 + (219 - 64) * t);
    const b = Math.round(175 + (254 - 175) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    // 90에 가까울수록 연빨강, 높을수록 진빨강
    const t = Math.min(1, (value - 90) / Math.max(0.1, maxV - 90));
    const r = Math.round(254 + (153 - 254) * t);
    const g = Math.round(202 + (27 - 202) * t);
    const b = Math.round(202 + (27 - 202) * t);
    return `rgb(${r},${g},${b})`;
  }
}

const SupplyDemandSection: React.FC<{ sdi: SupplyDemandIndex }> = React.memo(({ sdi }) => {
  const [expanded, setExpanded] = useState(true);
  const REGIONS = ['서울', '경기', '인천'] as const;
  const { width: screenW } = useWindowDimensions();
  const LABEL_W = 38;
  const VALUE_W = 42;
  const H_GAP = 8;
  const BAR_H = 13;
  const maxBarW = screenW - 64 - LABEL_W - VALUE_W - H_GAP * 2;
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#262626' }}>아파트 매매수급지수</Text>
          <Text style={{ fontSize: 11, color: '#8e8e8e', marginTop: 2 }}>100 초과=매수 우위 · 한국부동산원</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {(() => {
            const sSeoul = sdi.data['서울'];
            if (!sSeoul || sSeoul.length === 0) return null;
            const cur = sSeoul[sSeoul.length - 1].value;
            const minSeoul = Math.min(...sSeoul.map(p => p.value));
            const maxSeoul = Math.max(...sSeoul.map(p => p.value));
            return <Text style={{ fontSize: 20, fontWeight: '800', color: sdiBarColor(cur, minSeoul, maxSeoul) }}>서울 {cur.toFixed(1)}</Text>;
          })()}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{expanded ? '접기' : '펼치기'}</Text>
            <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color="#8e8e8e" />
          </View>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#f5f5f5' }}>
          {REGIONS.map(region => {
            const pts = sdi.data[region];
            if (!pts || pts.length === 0) return null;
            const minV = Math.min(...pts.map(p => p.value));
            const maxV = Math.max(...pts.map(p => p.value));
            const range = maxV - minV || 0.01;
            const cur = pts[pts.length - 1].value;
            const prev = pts.length >= 2 ? pts[pts.length - 2].value : cur;
            const diff = cur - prev;
            const curColor = sdiBarColor(cur, minV, maxV);
            const diffColor = diff > 0 ? '#ef4444' : diff < 0 ? '#1d4ed8' : '#8e8e8e';
            return (
              <View key={region} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#262626', width: 44 }}>{region}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: curColor, marginLeft: 4 }}>{cur.toFixed(1)}</Text>
                  <Text style={{ fontSize: 11, color: diffColor, marginLeft: 6 }}>
                    {diff > 0 ? `▲${diff.toFixed(1)}` : diff < 0 ? `▼${Math.abs(diff).toFixed(1)}` : '─'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>전월비</Text>
                </View>
                <View style={{ gap: 3 }}>
                  {pts.map((p, i) => {
                    const isLast = i === pts.length - 1;
                    const barW = Math.max(4, Math.round(((p.value - minV) / range) * maxBarW));
                    const monthLabel = `${p.month.slice(2, 4)}.${p.month.slice(4)}`;
                    const barCol = sdiBarColor(p.value, minV, maxV);
                    return (
                      <View key={p.month} style={{ flexDirection: 'row', alignItems: 'center', gap: H_GAP }}>
                        <Text style={{ width: LABEL_W, fontSize: 10, color: isLast ? curColor : '#6b7280', textAlign: 'right', fontWeight: isLast ? '700' : '400' }}>
                          {monthLabel}
                        </Text>
                        <View style={{ flex: 1, height: BAR_H, justifyContent: 'center' }}>
                          <View style={{ height: BAR_H, width: barW, backgroundColor: barCol, borderRadius: 3 }} />
                        </View>
                        <Text style={{ width: VALUE_W, fontSize: 10, color: isLast ? curColor : '#374151', fontWeight: isLast ? '700' : '400', textAlign: 'right' }}>
                          {p.value.toFixed(1)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 12, textAlign: 'right' }}>{sdi.lastUpdated} 기준</Text>
        </View>
      )}
    </View>
  );
});

const RateChartSection: React.FC<{ chart: RateChart }> = React.memo(({ chart }) => {
  const [expanded, setExpanded] = useState(true);
  const changeColor = chart.change < 0 ? '#1d4ed8' : chart.change > 0 ? '#ef4444' : '#8e8e8e';
  const changeLabel = `${chart.change >= 0 ? '▲' : '▼'} ${Math.abs(chart.change).toFixed(2)}%p 전월比`;
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#262626' }}>{chart.name}</Text>
          <Text style={{ fontSize: 11, color: '#8e8e8e', marginTop: 2 }}>{chart.subtitle}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#262626' }}>{chart.current.toFixed(2)}%</Text>
          <Text style={{ fontSize: 11, color: changeColor, fontWeight: '600', marginTop: 2 }}>{changeLabel}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{expanded ? '접기' : '펼치기'}</Text>
            <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color="#8e8e8e" />
          </View>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#f5f5f5' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 8 }}>연도별 추이</Text>
          <RateBarChart
            data={chart.yearlyData.map(d => ({ label: d.year ?? '', value: d.value }))}
            color="#bfdbfe"
            highlightColor="#1d4ed8"
            showEveryN={2}
          />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 8 }}>월별 추이</Text>
          <RateHBarChart
            data={chart.monthlyData.map(d => ({ label: d.month ?? '', value: d.value }))}
            color="#93c5fd"
            highlightColor="#1d4ed8"
          />
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 12, textAlign: 'right' }}>{chart.updatedAt} 기준</Text>
        </View>
      )}
    </View>
  );
});

const SCHOOL_ROW_COLORS = { gold: '#f59e0b', silver: '#9ca3af', bronze: '#b45309', normal: '#6b7280' } as const;

const SchoolTable: React.FC<{ schools: SchoolEntry[]; collapsed: boolean }> = React.memo(({ schools, collapsed }) => {
  const list = collapsed ? schools.slice(0, 10) : schools;
  return (
    <>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ width: 30, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>번호</Text>
        <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>학교명</Text>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>시</Text>
        <Text style={{ flex: 0.9, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>구</Text>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>동</Text>
      </View>
      {list.map(school => {
        const isTop3 = school.rank <= 3;
        const rankColor = school.rank === 1 ? SCHOOL_ROW_COLORS.gold : school.rank === 2 ? SCHOOL_ROW_COLORS.silver : school.rank === 3 ? SCHOOL_ROW_COLORS.bronze : SCHOOL_ROW_COLORS.normal;
        return (
          <View key={school.rank} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: isTop3 ? '#fffbeb' : '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ width: 30, fontSize: 13, fontWeight: '700', color: rankColor }}>{school.rank}</Text>
            <Text style={{ flex: 1.5, fontSize: 13, fontWeight: isTop3 ? '600' : '400', color: '#262626' }}>{school.name}</Text>
            <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>{school.city}</Text>
            <Text style={{ flex: 0.9, fontSize: 12, color: '#374151' }}>{school.gu || '-'}</Text>
            <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>{school.dong}</Text>
          </View>
        );
      })}
    </>
  );
});


const SpecialSchoolTable: React.FC<{ schools: SpecialSchoolEntry[]; collapsed: boolean }> = React.memo(({ schools, collapsed }) => {
  const list = collapsed ? schools.slice(0, 10) : schools;
  return (
    <>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ width: 30, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>순위</Text>
        <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>학교명</Text>
        <Text style={{ flex: 1.3, fontSize: 11, fontWeight: '600', color: '#6b7280' }}>위치</Text>
        <Text style={{ flex: 0.8, fontSize: 11, fontWeight: '600', color: '#4f46e5', textAlign: 'right' }}>진학률</Text>
      </View>
      {list.map(school => {
        const isTop3 = school.rank <= 3;
        const rankColor = school.rank === 1 ? SCHOOL_ROW_COLORS.gold : school.rank === 2 ? SCHOOL_ROW_COLORS.silver : school.rank === 3 ? SCHOOL_ROW_COLORS.bronze : SCHOOL_ROW_COLORS.normal;
        const rateColor = school.rate >= 15 ? '#dc2626' : school.rate >= 10 ? '#d97706' : school.rate >= 5 ? '#2563eb' : '#6b7280';
        const location = [school.city, school.gu, school.dong].filter(Boolean).join(' ');
        return (
          <View key={school.rank} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: isTop3 ? '#fffbeb' : '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ width: 30, fontSize: 13, fontWeight: '700', color: rankColor }}>{school.rank}</Text>
            <Text style={{ flex: 1.5, fontSize: 13, fontWeight: isTop3 ? '600' : '400', color: '#262626' }}>{school.name}</Text>
            <Text style={{ flex: 1.3, fontSize: 11, color: '#6b7280' }}>{location}</Text>
            <Text style={{ flex: 0.8, fontSize: 13, fontWeight: '700', color: rateColor, textAlign: 'right' }}>{school.rate.toFixed(1)}%</Text>
          </View>
        );
      })}
    </>
  );
});

const SchoolAnalysisModal = React.memo<{ visible: boolean; onClose: () => void }>(
  function SchoolAnalysisModal({ visible, onClose }) {
    const [activeTab, setActiveTab] = useState<'elem' | 'middle' | 'high'>('middle');
    const [criteria, setCriteria] = useState<'location' | 'special'>('location');
    const [collapsed, setCollapsed] = useState(false);

    const handleTabPress = useCallback((tab: 'elem' | 'middle' | 'high') => {
      setActiveTab(tab);
      setCriteria('location');
      setCollapsed(false);
    }, []);

    const handleCriteriaPress = useCallback((c: 'location' | 'special') => {
      setCriteria(c);
      setCollapsed(false);
    }, []);

    const isSpecial = activeTab === 'middle' && criteria === 'special';
    const tabData = activeTab === 'elem' ? GYEONGGI_ELEM_SCHOOLS : activeTab === 'middle' ? GYEONGGI_MIDDLE_SCHOOLS : GYEONGGI_HIGH_SCHOOLS;
    const specialData = GYEONGGI_MIDDLE_SPECIAL_SCHOOLS;
    const listLength = isSpecial ? specialData.length : tabData.length;

    const footnote = isSpecial
      ? '※ 출처: 학교알리미 졸업생 진로현황 (blog.allinfo.today) · 과학고+외국어고+자사고 합산 · 2024년 기준'
      : '※ 위치 정보 출처: NEIS 나이스 교육정보시스템 공식 API · 번호는 지역별 나열';

    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#262626' }}>학군분석</Text>
              <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 2 }}>경기도 · NEIS 공식 위치</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={24} color="#262626" />
            </TouchableOpacity>
          </View>
          {/* 학교급 탭 */}
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
            {(['elem', 'middle', 'high'] as const).map(tab => {
              const label = tab === 'elem' ? '초등학교' : tab === 'middle' ? '중학교' : '고등학교';
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => handleTabPress(tab)}
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: isActive ? '#262626' : 'transparent' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: isActive ? '700' : '400', color: isActive ? '#262626' : '#8e8e8e' }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* 기준 선택 (중학교 탭에서만) */}
          {activeTab === 'middle' && (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
              {(['location', 'special'] as const).map(c => {
                const label = c === 'location' ? '지역별 목록' : '특목고 진학률 순위';
                const isActive = criteria === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => handleCriteriaPress(c)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: isActive ? '#262626' : '#f3f4f6' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#fff' : '#6b7280' }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {isSpecial
              ? <SpecialSchoolTable schools={specialData} collapsed={collapsed} />
              : <SchoolTable schools={tabData} collapsed={collapsed} />
            }
            <TouchableOpacity
              onPress={() => setCollapsed(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{collapsed ? `펼치기 (${listLength - 10}개 더보기)` : '접기'}</Text>
              <MaterialIcons name={collapsed ? 'expand-more' : 'expand-less'} size={18} color="#374151" />
            </TouchableOpacity>
            <Text style={{ fontSize: 10, color: '#9ca3af', marginHorizontal: 16, marginTop: 8, lineHeight: 15 }}>{footnote}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }
);

const RateAnalysisModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  rateCharts: RateChart[];
  supplyDemandIndex: SupplyDemandIndex | null;
}> = React.memo(({ visible, onClose, rateCharts, supplyDemandIndex }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#262626' }}>지표분석</Text>
          <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 2 }}>기준금리 · 주담대금리 · 매매수급지수</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="close" size={24} color="#262626" />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {rateCharts.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <MaterialIcons name="show-chart" size={40} color="#d1d5db" />
            <Text style={{ color: '#8e8e8e', marginTop: 12 }}>데이터 로딩 중...</Text>
          </View>
        ) : rateCharts.map(chart => (
          <RateChartSection key={chart.id} chart={chart} />
        ))}
        {supplyDemandIndex && <SupplyDemandSection sdi={supplyDemandIndex} />}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  </Modal>
));

const SujiDongCard: React.FC<{ sujiComplexes: Record<string, Record<string, JukjeonComplex[]>> }> = React.memo(({ sujiComplexes }) => {
  const hasAny = GU_ORDER.some(gu => Object.keys(sujiComplexes[gu] ?? {}).length > 0);
  if (!hasAny) return null;
  return (
    <View style={{ marginHorizontal: 12, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>동별 매매가</Text>
        <Text style={{ fontSize: 11, color: '#8e8e8e', marginTop: 2 }}>수지·기흥·동탄·마포·용산·성동·연수구</Text>
      </View>
      {GU_ORDER.map((gu, i) => (
        <GuSection key={gu} guName={gu} guData={sujiComplexes[gu] ?? {}} isFirst={i === 0} />
      ))}
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginHorizontal: 12, marginBottom: 10, marginTop: 4 }}>국토부 실거래가 · 단지 중앙값의 중앙값 · 최근 5개월</Text>
    </View>
  );
});

const SujiDongModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  sujiComplexes: Record<string, Record<string, JukjeonComplex[]>>;
}> = React.memo(({ visible, onClose, sujiComplexes }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#262626' }}>동별 매매가</Text>
          <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 2 }}>수지·기흥·동탄·마포·용산·성동·연수구</Text>
        </View>
        <PressableScale onPress={onClose} contentStyle={{ padding: 4 }} scaleTo={0.85}>
          <MaterialIcons name="close" size={24} color="#262626" />
        </PressableScale>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {GU_ORDER.map((gu, i) => (
          <GuSection key={gu} guName={gu} guData={sujiComplexes[gu] ?? {}} isFirst={i === 0} />
        ))}
        <Text style={{ fontSize: 9, color: '#8e8e8e', marginHorizontal: 16, marginTop: 12 }}>국토부 실거래가 · 단지 중앙값의 중앙값 · 최근 5개월</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>
));

async function openNaverLand(aptName: string): Promise<void> {
  const encoded = encodeURIComponent(aptName);
  try {
    const res = await fetch(
      `https://new.land.naver.com/api/complexes/autocomplete?query=${encoded}`,
      { headers: { Referer: 'https://new.land.naver.com/' } }
    );
    const data = await res.json();
    const complexNo = data?.complexes?.[0]?.complexNo;
    if (complexNo) {
      Linking.openURL(`https://fin.land.naver.com/complexes/${complexNo}?tab=transaction`);
      return;
    }
  } catch {}
  Linking.openURL(`https://m.land.naver.com/search/result?query=${encoded}`);
}

const DongComplexTable: React.FC<{ dongName: string; complexes: JukjeonComplex[]; mortgageRateByMonth: Record<string, number> }> = React.memo(({ dongName, complexes, mortgageRateByMonth }) => {
  const [expanded, setExpanded] = useState(false);
  if (complexes.length === 0) return null;

  const toggle = () => {
    setExpanded(v => !v);
  };

  return (
    <View style={{ backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', overflow: 'hidden' }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>{dongName} 단지별 매매가</Text>
          <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{complexes.length}개</Text>
        </View>
        <MaterialIcons name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color="#8e8e8e" />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true}>
            <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden', minWidth: 476 }}>
              {/* 헤더 */}
              <View style={{ flexDirection: 'row', backgroundColor: '#fafafa', paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center' }}>
                <Text style={{ width: 130, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>단지명</Text>
                <Text style={{ width: 56, fontSize: 11, fontWeight: '600', color: '#8e8e8e', textAlign: 'right' }}>현재가</Text>
                <View style={{ width: 68, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>PIR추세</Text>
                </View>
                <Text style={{ width: 44, fontSize: 11, fontWeight: '600', color: '#8e8e8e', textAlign: 'right' }}>K-HAI</Text>
                <View style={{ width: 68, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>가격추세</Text>
                </View>
                <View style={{ width: 60, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>거래건수</Text>
                </View>
                <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e', textAlign: 'right' }}>기준</Text>
              </View>
              {/* 데이터 행 */}
              {complexes.map((c, idx) => {
                const priceValues = c.monthlyData.map(d => d.median);
                const countValues = c.monthlyData.map(d => d.count);
                const totalCount = countValues.reduce((s, v) => s + v, 0);
                // 전반부 vs 후반부 비교로 추세 판단
                const half = Math.floor(c.monthlyData.length / 2);
                const firstHalf = c.monthlyData.slice(0, half);
                const lastHalf = c.monthlyData.slice(-half);
                const avgP = (arr: typeof firstHalf) => { const v = arr.filter(d => d.median > 0); return v.length ? v.reduce((s, d) => s + d.median, 0) / v.length : 0; };
                const priceFirst = avgP(firstHalf), priceLast = avgP(lastHalf);
                const countFirst = firstHalf.reduce((s, d) => s + d.count, 0);
                const countLast = lastHalf.reduce((s, d) => s + d.count, 0);
                const isDown = priceLast < priceFirst;
                const nameColor = (priceLast > priceFirst && countLast < countFirst) ? '#ef4444'
                  : (isDown && countLast > countFirst) ? '#1d4ed8'
                  : isDown ? '#60a5fa'
                  : '#262626';
                return (
                  <PressableScale
                    key={idx}
                    onPress={() => openNaverLand(c.name)}
                    contentStyle={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'center' }}
                    scaleTo={0.97}
                  >
                    {nameColor !== '#262626'
                      ? <PulseText style={{ width: 130, fontSize: 12, color: nameColor, fontWeight: '600' }} numberOfLines={1}>{c.name}</PulseText>
                      : <Text style={{ width: 130, fontSize: 12, color: '#262626' }} numberOfLines={1}>{c.name}</Text>
                    }
                    <Text style={{ width: 56, fontSize: 12, fontWeight: '600', color: '#0095f6', textAlign: 'right' }}>{c.medianPrice}억</Text>
                    <View style={{ width: 68, alignItems: 'flex-end' }}>
                      <MiniSparkBars
                        values={c.monthlyData.map(d => {
                          if (d.median <= 0) return 0;
                          const annualInc = getMonthlyIncomeMAN(d.month) * 12;
                          return Math.round(d.median * 10000 / annualInc * 10) / 10;
                        })}
                        activeColor="#f97316" inactiveColor="#fed7aa"
                      />
                      <Text style={{ fontSize: 9, color: '#f97316', marginTop: 1 }}>
                        {(Math.round(c.medianPrice * 10000 / (getMonthlyIncomeMAN(c.refMonth) * 12) * 10) / 10).toFixed(1)}배
                      </Text>
                    </View>
                    {(() => {
                      const rate = mortgageRateByMonth[c.refMonth] ?? KHAI_RATE_DEFAULT;
                      const income = getMonthlyIncomeMAN(c.refMonth);
                      const khai = computeKHAI(c.medianPrice, rate, income);
                      const khaiColor = khai < 100 ? '#16a34a' : khai < 150 ? '#f97316' : '#ef4444';
                      return <Text style={{ width: 44, fontSize: 12, fontWeight: '600', color: khaiColor, textAlign: 'right' }}>{khai}</Text>;
                    })()}
                    <View style={{ width: 68, alignItems: 'flex-end' }}>
                      <MiniSparkBars values={priceValues} activeColor="#7c3aed" inactiveColor="#c4b5fd" />
                    </View>
                    <View style={{ width: 60, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 10, color: '#8e8e8e' }}>{totalCount}건</Text>
                      <MiniSparkBars values={countValues} />
                    </View>
                    <Text style={{ width: 38, fontSize: 10, color: '#8e8e8e', textAlign: 'right' }}>{c.refMonth}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </ScrollView>
          <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 6 }}>국토부 실거래가 · 최근 5개월 · 탭하면 네이버 부동산 검색</Text>
        </View>
      )}
    </View>
  );
});

const SUJI_DONG_ORDER = ['죽전동', '풍덕천동', '신봉동', '동천동', '기흥구', '동탄구'] as const;

const SujiComplexModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  sujiComplexes: Record<string, Record<string, JukjeonComplex[]>>;
  mortgageRateByMonth: Record<string, number>;
}> = React.memo(({ visible, onClose, sujiComplexes, mortgageRateByMonth }) => {
  const totalCount = GU_ORDER.reduce((s, gu) =>
    s + Object.values(sujiComplexes[gu] ?? {}).reduce((s2, arr) => s2 + arr.length, 0), 0);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#efefef' }}>
          <View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#262626' }}>아파트 단지 매매가</Text>
            <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 2 }}>{totalCount}개 단지 · 최근 5개월</Text>
          </View>
          <PressableScale onPress={onClose} contentStyle={{ padding: 4 }} scaleTo={0.85}>
            <MaterialIcons name="close" size={24} color="#262626" />
          </PressableScale>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {GU_ORDER.map(gu => {
            const guData = sujiComplexes[gu] ?? {};
            const dongs = Object.keys(guData).sort((a, b) => (guData[b][0]?.medianPrice ?? 0) - (guData[a][0]?.medianPrice ?? 0));
            const validDongs = dongs.filter(d => (guData[d]?.length ?? 0) > 0);
            if (validDongs.length === 0) return null;
            return (
              <View key={gu}>
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#8e8e8e' }}>{gu}</Text>
                </View>
                {validDongs.map((dong) => (
                  <DongComplexTable key={dong} dongName={dong} complexes={guData[dong]} mortgageRateByMonth={mortgageRateByMonth} />
                ))}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
});

export default function InvestmentScreen() {
  const { user } = useAuth();
  const uid = user!.uid;
  const {
    columns,
    termOfDay,
    newsArticles,
    dongCharts,
    regionCharts,
    sujiComplexes,
    complexUpdateReminder,
    rateUpdateReminder,
    rateCharts,
    supplyDemandIndex,
    taxPolicySummary,
    jongbuseSummary,
    bookmarks,
    loading,
    syncing,
    error,
    lastSyncTime,
    syncData,
    toggleBookmark,
  } = useInvestmentSync();

  const mortgageRateByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    const loanChart = rateCharts.find(c => c.id === 'loan-rate');
    if (loanChart) {
      for (const dp of loanChart.monthlyData) {
        if (dp.month) map[dp.month] = dp.value;
      }
    }
    return map;
  }, [rateCharts]);

  const { opacity, translateY } = useScreenFade();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<InvestmentColumn | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'real-estate' | 'stocks'>('all');
  const [sujiModalVisible, setSujiModalVisible] = useState(false);
  const [regionModalVisible, setRegionModalVisible] = useState(false);
  const [dongModalVisible, setDongModalVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [schoolModalVisible, setSchoolModalVisible] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncData();
    } finally {
      setRefreshing(false);
    }
  }, [syncData]);

  const handleColumnPress = useCallback((column: InvestmentColumn) => {
    setSelectedColumn(column);
    setDetailVisible(true);
  }, []);

  const handleToggleBookmark = useCallback(
    async (column: InvestmentColumn) => {
      await toggleBookmark(column.id);
    },
    [toggleBookmark]
  );

  const isBookmarked = useCallback(
    (columnId: string) => {
      return bookmarks?.includes(columnId) ?? false;
    },
    [bookmarks]
  );

  // Memoize filtered columns (stocks hidden from display)
  const filteredColumns = useMemo(
    () =>
      columns.filter(c =>
        c.category !== 'stocks' &&
        (selectedCategory === 'all' || c.category === selectedCategory)
      ),
    [columns, selectedCategory]
  );

  const formatLastSync = useCallback(() => {
    if (!lastSyncTime) return '동기화 안 됨';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSyncTime.getTime()) / 1000);

    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return lastSyncTime.toLocaleDateString();
  }, [lastSyncTime]);

  // These must stay unconditional (top-level) — moving them inside the
  // conditional FlatList JSX below caused "Rendered more hooks than during
  // the previous render" once columns loaded and the branch changed.
  const renderItem = useCallback(
    ({ item }: { item: InvestmentColumn }) => (
      <ColumnCard
        column={item}
        isBookmarked={isBookmarked(item.id)}
        onToggleBookmark={() => handleToggleBookmark(item)}
        onPress={() => handleColumnPress(item)}
      />
    ),
    [isBookmarked, handleToggleBookmark, handleColumnPress]
  );

  const keyExtractor = useCallback((item: InvestmentColumn) => item.id, []);

  const footerText = useMemo(() => formatLastSync(), [formatLastSync]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity }}>
      <View style={styles.header}>
        <View style={styles.headerTitleSection}>
          <Text style={styles.headerTitle}>📈 Markets</Text>
          <View style={styles.syncStatus}>
            <MaterialIcons
              name="cloud-done"
              size={16}
              color="#10b981"
            />
            <Text style={styles.syncStatusText}>{formatLastSync()}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {syncing && (
        <View style={{ height: 2, backgroundColor: '#eff6ff' }}>
          <View style={{ height: 2, width: '60%', backgroundColor: '#3b82f6', borderRadius: 1 }} />
        </View>
      )}

      {loading && !termOfDay && !regionCharts.length ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Markets 불러오는 중...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {complexUpdateReminder?.active && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {}}
              style={{ marginHorizontal: 12, marginTop: 12, backgroundColor: '#fff8e1', borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}
            >
              <MaterialIcons name="update" size={18} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400e' }}>부동산 데이터 업데이트 필요</Text>
                <Text style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>{complexUpdateReminder.targetMonth} 기준 · push_jukjeon_complexes.py 실행</Text>
              </View>
            </TouchableOpacity>
          )}
          {termOfDay && <AnimatedCard delay={0}><TermOfDayCard term={termOfDay} /></AnimatedCard>}
          {regionCharts.length > 0 && (
            <AnimatedCard delay={120}>
              <FloatingCard>
                <PressableScale
                  onPress={() => setRegionModalVisible(true)}
                  style={{ marginHorizontal: 12, marginTop: 12 }}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>지역별 매매가 비교</Text>
                    <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 3 }}>경기도 · {regionCharts.length}개 지역</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#8e8e8e" />
                </PressableScale>
              </FloatingCard>
            </AnimatedCard>
          )}
          {Object.keys(sujiComplexes).length > 0 && (
            <AnimatedCard delay={220}>
              <FloatingCard>
                <PressableScale
                  onPress={() => setDongModalVisible(true)}
                  style={{ marginHorizontal: 12, marginTop: 12 }}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>동별 매매가</Text>
                    <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 3 }}>수지·기흥·동탄·마포·용산·성동·연수구</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#8e8e8e" />
                </PressableScale>
              </FloatingCard>
            </AnimatedCard>
          )}
          {Object.keys(sujiComplexes).length > 0 && (
            <AnimatedCard delay={320}>
              <FloatingCard>
                <PressableScale
                  onPress={() => setSujiModalVisible(true)}
                  style={{ marginHorizontal: 12, marginTop: 12 }}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>아파트 단지 매매가</Text>
                    <Text style={{ fontSize: 12, color: '#8e8e8e', marginTop: 3 }}>
                      {GU_ORDER.filter(gu => Object.keys(sujiComplexes[gu] ?? {}).length > 0).length}개 구 · {GU_ORDER.reduce((s, gu) => s + Object.values(sujiComplexes[gu] ?? {}).reduce((s2, arr) => s2 + arr.length, 0), 0)}개 단지
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#8e8e8e" />
                </PressableScale>
              </FloatingCard>
            </AnimatedCard>
          )}
          {rateUpdateReminder?.active && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {}}
              style={{ marginHorizontal: 12, marginTop: 12, backgroundColor: '#eff6ff', borderRadius: 12, borderWidth: 1, borderColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}
            >
              <MaterialIcons name="trending-up" size={18} color="#3b82f6" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e40af' }}>금리 데이터 업데이트 필요</Text>
                <Text style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>{rateUpdateReminder.targetMonth} 기준 · fetch_interest_rates.py 실행</Text>
              </View>
            </TouchableOpacity>
          )}
          {(rateCharts.length > 0 || supplyDemandIndex) && (
            <AnimatedCard delay={420}>
              <FloatingCard>
                <PressableScale
                  onPress={() => setRateModalVisible(true)}
                  style={{ marginHorizontal: 12, marginTop: 12 }}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', paddingHorizontal: 16, paddingVertical: 14 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>지표분석</Text>
                      {rateCharts.map(chart => {
                        const changeColor = chart.change < 0 ? '#1d4ed8' : chart.change > 0 ? '#ef4444' : '#8e8e8e';
                        return (
                          <View key={chart.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 }}>
                            <Text style={{ fontSize: 11, color: '#8e8e8e', width: 80 }}>{chart.name}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#262626' }}>{chart.current.toFixed(2)}%</Text>
                            <Text style={{ fontSize: 10, color: changeColor }}>
                              {chart.change < 0 ? '▼' : '▲'}{Math.abs(chart.change).toFixed(2)}
                            </Text>
                            <MiniSparkBars
                              values={chart.monthlyData.slice(-8).map(d => d.value - Math.min(...chart.monthlyData.map(x => x.value)) + 0.01)}
                              activeColor="#1d4ed8"
                              inactiveColor="#bfdbfe"
                            />
                          </View>
                        );
                      })}
                      {supplyDemandIndex && (() => {
                        const regions = ['서울', '경기', '인천'] as const;
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 }}>
                            <Text style={{ fontSize: 11, color: '#8e8e8e', width: 80 }}>매매수급지수</Text>
                            {regions.map(r => {
                              const pts = supplyDemandIndex.data[r];
                              if (!pts || pts.length === 0) return null;
                              const cur = pts[pts.length - 1].value;
                              const color = cur > 105 ? '#ef4444' : cur > 100 ? '#f97316' : '#1d4ed8';
                              return (
                                <Text key={r} style={{ fontSize: 10, color, fontWeight: '700' }}>{r} {cur.toFixed(0)}</Text>
                              );
                            })}
                          </View>
                        );
                      })()}
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color="#8e8e8e" />
                  </View>
                </PressableScale>
              </FloatingCard>
            </AnimatedCard>
          )}
          <AnimatedCard delay={460}>
            <FloatingCard>
              <PressableScale
                onPress={() => setSchoolModalVisible(true)}
                style={{ marginHorizontal: 12, marginTop: 12 }}
                contentStyle={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#dbdbdb', paddingHorizontal: 16, paddingVertical: 14 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#262626' }}>학군분석</Text>
                    <Text style={{ fontSize: 11, color: '#8e8e8e', marginTop: 2 }}>경기도 중학교 학업성취도 순위</Text>
                    <View style={{ marginTop: 8, gap: 5 }}>
                      {GYEONGGI_MIDDLE_SCHOOLS.slice(0, 3).map(school => {
                        const rankColor = school.rank === 1 ? '#f59e0b' : school.rank === 2 ? '#9ca3af' : '#b45309';
                        return (
                          <View key={school.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: rankColor, width: 16, textAlign: 'center' }}>{school.rank}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#262626' }}>{school.name}</Text>
                            <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{school.city} {school.gu} {school.dong}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#8e8e8e" />
                </View>
              </PressableScale>
            </FloatingCard>
          </AnimatedCard>
          <View style={styles.footer}>
            <Text style={styles.footerText}>모든 정보는 {footerText} 기준입니다</Text>
          </View>
        </ScrollView>
      )}

      <SujiDongModal
        visible={dongModalVisible}
        onClose={() => setDongModalVisible(false)}
        sujiComplexes={sujiComplexes}
      />
      <SujiComplexModal
        visible={sujiModalVisible}
        onClose={() => setSujiModalVisible(false)}
        sujiComplexes={sujiComplexes}
        mortgageRateByMonth={mortgageRateByMonth}
      />
      <RateAnalysisModal
        visible={rateModalVisible}
        onClose={() => setRateModalVisible(false)}
        rateCharts={rateCharts}
        supplyDemandIndex={supplyDemandIndex}
      />
      <SchoolAnalysisModal
        visible={schoolModalVisible}
        onClose={() => setSchoolModalVisible(false)}
      />
      <RegionBrowserModal
        visible={regionModalVisible}
        onClose={() => setRegionModalVisible(false)}
        regionCharts={regionCharts}
      />
      <DetailModal column={selectedColumn} visible={detailVisible} onClose={() => setDetailVisible(false)} dongCharts={dongCharts} taxPolicySummary={taxPolicySummary} jongbuseSummary={jongbuseSummary} newsArticles={newsArticles} />
      <FilterModal
        visible={filterVisible}
        selectedCategory={selectedCategory}
        onClose={() => setFilterVisible(false)}
        onSelectCategory={setSelectedCategory}
      />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 4,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  filterButton: {
    padding: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8e8e8e',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8e8e8e',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '600',
    color: '#262626',
    marginTop: 8,
  },
  columnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  columnMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  bookmarkButton: {
    padding: 4,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 10,
    lineHeight: 22,
  },
  columnInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#fafafa',
    borderBottomColor: '#fafafa',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#262626',
  },
  authorTitle: {
    fontSize: 11,
    color: '#8e8e8e',
  },
  outlookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
    borderRadius: 6,
  },
  outlookText: {
    fontSize: 11,
    fontWeight: '600',
  },
  columnSummary: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 18,
    marginBottom: 10,
  },
  columnFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#fafafa',
  },
  readTime: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  regionSection: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  regionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
  },
  regionSubtitle: {
    fontSize: 10,
    color: '#8e8e8e',
  },
  regionSiChip: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionSiChipActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  regionSiChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionSiChipTextActive: {
    color: '#fff',
  },
  regionGuChip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionGuChipActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  regionGuChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8e8e8e',
  },
  regionGuChipTextActive: {
    color: '#0095f6',
    fontWeight: '600',
  },
  regionDongChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionDongChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e3a8a',
  },
  regionDongChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8e8e8e',
  },
  regionDongChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  regionFavToggle: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionFavToggleActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  regionFavToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionFavToggleTextActive: {
    color: '#d97706',
  },
  regionStarBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
    marginBottom: 8,
  },
  regionStarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionStarBtnTextActive: {
    color: '#f59e0b',
  },
  regionFavRemoveBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    marginBottom: 8,
  },
  regionFavRemoveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
  },
  regionFavEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  regionFavEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionFavEmptyHint: {
    fontSize: 12,
    color: '#dbdbdb',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  detailDate: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  detailReadTime: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  detailColumnTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 16,
    lineHeight: 28,
  },
  detailAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  detailAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  detailAuthorTitle: {
    fontSize: 12,
    color: '#8e8e8e',
    marginTop: 2,
  },
  detailStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  statLabel: {
    fontSize: 11,
    color: '#8e8e8e',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fafafa',
  },
  detailSectionContent: {
    fontSize: 14,
    color: '#8e8e8e',
    lineHeight: 22,
  },
  detailSource: {
    fontSize: 12,
    color: '#8e8e8e',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  readCompleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0095f6',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 32,
  },
  readCompleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  fsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  fsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
  },
  chartChipRow: {
    gap: 8,
    paddingBottom: 14,
  },
  chartChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  chartChipActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  chartChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  chartChipTextActive: {
    color: '#fff',
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    justifyContent: 'space-between',
    height: TRACK_H,
    marginTop: TRACK_BOTTOM_Y - TRACK_H,
    marginRight: 8,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: '#dbdbdb',
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#8e8e8e',
    textAlign: 'right',
  },
  chartUnit: {
    fontSize: 11,
    color: '#8e8e8e',
    textAlign: 'right',
    marginTop: 6,
  },
  barChart: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barValue: {
    fontSize: 10,
    color: '#8e8e8e',
    marginBottom: 4,
  },
  barTrack: {
    width: 20,
    height: 80,
    justifyContent: 'flex-end',
    backgroundColor: '#fafafa',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#0095f6',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 11,
    color: '#8e8e8e',
    marginTop: 6,
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  viewModeButton: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  viewModeButtonActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  viewModeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  viewModeButtonTextActive: {
    color: '#0095f6',
  },
  hChartScroll: {
    flex: 1,
  },
  hBarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  hBarColumn: {
    width: 48,
    alignItems: 'center',
  },
  boxPlotTrack: {
    width: 24,
    height: 80,
    position: 'relative',
  },
  boxWhisker: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    width: 2,
    backgroundColor: '#8e8e8e',
  },
  boxRect: {
    position: 'absolute',
    left: 2,
    right: 2,
    backgroundColor: '#93c5fd',
    borderWidth: 1,
    borderColor: '#0095f6',
    borderRadius: 2,
  },
  boxMedian: {
    position: 'absolute',
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: '#1d4ed8',
  },
  boxAvgDot: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: -3,
    backgroundColor: '#f97316',
    borderWidth: 1,
    borderColor: '#fff',
  },
  boxOutlierDot: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: -3,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#fff',
  },
  boxRangeLabel: {
    fontSize: 9,
    color: '#8e8e8e',
    marginTop: 2,
  },
  filterContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
  },
  filterContent: {
    flex: 1,
    padding: 16,
  },
  filterSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  filterOptions: {
    gap: 10,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  filterOptionActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  filterOptionTextActive: {
    color: '#0095f6',
    fontWeight: '600',
  },

  // BoxPlot 통계 테이블
  bpTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#fafafa',
  },
  bpTableRowAlt: {
    backgroundColor: '#fafafa',
  },
  bpTableLabelCell: {
    width: 44,
    paddingVertical: 5,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#dbdbdb',
  },
  bpTableCell: {
    width: 52,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bpTableHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  bpTableLabelText: {
    fontSize: 10,
    color: '#262626',
    fontWeight: '600',
  },
  bpTableText: {
    fontSize: 10,
    color: '#262626',
  },

  // TermOfDayCard
  termCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  termHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  termHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  termSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    letterSpacing: 0.3,
  },
  termTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  termName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
  },
  termCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  termCategoryText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  termFullName: {
    fontSize: 12,
    color: '#0095f6',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  termDefinition: {
    fontSize: 14,
    color: '#262626',
    lineHeight: 20,
    marginBottom: 6,
  },
  termDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    marginBottom: 4,
  },
  termDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  termDetailText: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 19,
  },
  termTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#e7f5ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  termTipText: {
    flex: 1,
    fontSize: 13,
    color: '#0095f6',
    lineHeight: 18,
    fontWeight: '500',
  },
  termCompleteBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0095f6',
    alignItems: 'center',
  },
  termCompleteBtnDone: {
    backgroundColor: '#d1fae5',
  },
  termCompleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  termCompleteBtnTextDone: {
    color: '#065f46',
  },

  // NewsCard
  newsSection: {
    marginBottom: 12,
    marginHorizontal: 4,
  },
  newsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  newsSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    letterSpacing: 0.3,
  },
  newsArticleCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  newsArticleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  newsCategoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  newsCategoryText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  newsSourceText: {
    fontSize: 12,
    color: '#8e8e8e',
    fontWeight: '500',
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsSummary: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 19,
  },
});
