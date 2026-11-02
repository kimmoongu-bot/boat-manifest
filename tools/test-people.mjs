// 테스트용 가짜 손님 5명 (혼자 3명 + 일행 2명). 실제 인물 아님
export const people = [
  { file: '1_solo_kimbada', note: '혼자 · 보통 성인',
    p: { name: '김바다', birth: '1965-03-12', sex: '남', addr: '경상남도 통영시 도남로 123', phone: '010-2345-6789', emerName: '이미영', emerPhone: '010-9876-5432', made: '2026-10-20' } },
  { file: '2_solo_parkhaesun', note: '혼자 · QR 만든 지 1년 넘음(경고 확인용)',
    p: { name: '박해순', birth: '1958-11-03', sex: '여', addr: '전라남도 여수시 돌산읍 돌산로 45', phone: '010-3456-7890', emerName: '박철수', emerPhone: '061-123-4567', made: '2025-06-01' } },
  { file: '3_solo_choiminjun', note: '혼자 · 12세(보호자 없는 14세 미만 경고 확인용)',
    p: { name: '최민준', birth: '2014-05-20', sex: '남', addr: '부산광역시 사하구 다대로 77', phone: '010-4567-8901', emerName: '최영호', emerPhone: '010-5678-9012', made: '2026-10-28' } },
  { file: '4_group1of2_ohsangcheol', note: '일행 1/2 · 대표(보호자)', grp: { grp: 'TEST01', idx: 1, cnt: 2 },
    p: { name: '오상철', birth: '1972-08-15', sex: '남', addr: '경상남도 거제시 장승포로 200', phone: '010-6789-0123', emerName: '김선희', emerPhone: '010-7890-1234', made: '2026-11-01' } },
  { file: '5_group2of2_ohjimin', note: '일행 2/2 · 11세 자녀(보호자 동행)', grp: { grp: 'TEST01', idx: 2, cnt: 2 },
    p: { name: '오지민', birth: '2015-04-02', sex: '여', addr: '경상남도 거제시 장승포로 200', phone: '010-6789-0123', emerName: '김선희', emerPhone: '010-7890-1234', made: '2026-11-01' } },
];
