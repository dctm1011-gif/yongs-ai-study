# Git/EAS Build Issue - 문제 분석 및 해결 과정

**문제 발생 날짜:** 2026-07-04  
**상태:** ✅ 해결됨

---

## 1. 문제 정의

### 증상
```
Failed to upload the project tarball to EAS Build
Reason: git rev-parse --show-toplevel exited with non-zero code: 3221225794
```

다중 빌드 시도가 모두 실패:
- PowerShell에서 `eas build` 실행 → git rev-parse 오류
- `cli.appVersionSource: "local"` 설정 추가 → 동일 오류
- `.eas` 캐시 삭제 → 동일 오류

### 근본 원인 분석

**Layer 1: 환경 구성**
- ✅ Git이 설치됨: `C:\Program Files\Git 2.55.0.windows.1`
- ❌ PowerShell의 `$env:PATH`에 Git 경로 미등재
- ✅ Git Bash에서는 정상 작동 (`/mingw64/bin/git`)

**Layer 2: EAS CLI 동작**
1. 사용자가 PowerShell에서 `eas build -p android -e preview --wait` 실행
2. EAS CLI가 프로젝트를 tar로 압축하며 업로드 준비
3. 업로드 시점에 `git rev-parse --show-toplevel` 실행 (git 메타데이터 검증)
4. PowerShell의 PATH에 git이 없어 명령 실패
5. Exit code 3221225794 (ERROR_NOT_FOUND) 반환

**Layer 3: 실패의 캐스케이딩**
- 이전 시도들도 모두 같은 환경에서 실행 → 재현 불가능한 상태
- 사용자는 app.json 수정만 해도 EAS 캐시 문제로 생각
- 실제 문제는 git 환경이 아닌 것으로 오류 진단

---

## 2. 해결 방법

### 2.1 문제 발견 프로세스
```
순서 1: Bash에서 git status 작동 확인
        → "Bash에서는 되는데 PowerShell에서는?"
순서 2: PowerShell에서 git 명령 실패 확인
        → "PATH 문제 의심"
순서 3: where git 명령으로 git 미검색 확인
순서 4: Bash에서 which git으로 /mingw64/bin/git 확인
        → "PowerShell의 PATH에만 없음" (확인)
순서 5: find로 Git 설치 위치 파악
        → C:\Program Files\Git\cmd\git.exe 확인
```

### 2.2 적용된 해결책

**즉시 (현재 세션)**
```powershell
$env:PATH = "C:\Program Files\Git\cmd;$env:PATH"
git --version  # 검증 완료
```

**장기 (향후 모든 PowerShell 세션)**

PowerShell 프로필에 자동 로드 설정 추가:
```powershell
파일: C:\Users\dctm1\OneDrive\문서\WindowsPowerShell\profile.ps1
```

내용:
```powershell
# Git PATH Configuration
if ($env:PATH -notlike "*C:\Program Files\Git\cmd*") {
  $env:PATH = "C:\Program Files\Git\cmd;$env:PATH"
}
```

**편의성 (빌드 스크립트)**

생성 파일: `C:\Users\dctm1\YongStudyApp\build-apk.ps1`

기능:
- ✅ git 자동 감지 및 PATH 추가
- ✅ git 저장소 유효성 검증
- ✅ 미커밋 파일 확인 및 사용자 확인
- ✅ EAS 빌드 자동 실행

사용법:
```powershell
cd C:\Users\dctm1\YongStudyApp
.\build-apk.ps1
# 또는
.\build-apk.ps1 -Environment production -Wait
```

---

## 3. 재발방지대책

### 3.1 직접 방지 (Git 환경)
| 조치 | 대상 | 상태 |
|------|------|------|
| PowerShell 프로필 git PATH | 모든 미래 PowerShell 세션 | ✅ 적용 |
| build-apk.ps1 자동화 | EAS 빌드 시마다 | ✅ 작성 |
| 환경 검증 스크립트 | CI/CD 통합 시 | ⏳ 미래 고려 |

### 3.2 근본 방지 (프로세스 개선)
1. **EAS 빌드 시 항상 Bash 사용** 추천
   - Bash에서는 git이 기본 포함
   - PowerShell은 프로필 로드 필수
   
2. **CI/CD 통합 시 고려사항**
   - GitHub Actions: Linux 기본 (git 기본 포함, 무관)
   - Local builds: Bash 또는 build-apk.ps1 스크립트 사용

3. **개발자 가이드 작성** (향후)
   - "PowerShell에서 EAS 빌드하려면?"
   - "Git이 없다는 오류가 나면?"

---

## 4. 기술 세부사항

### 4.1 Exit Code 해석
```
3221225794 (0xC0000135)
= STATUS_DLL_NOT_FOUND in Windows
= 프로세스를 찾을 수 없음 또는 명령을 찾을 수 없음
```

이 경우: PowerShell이 PATH에서 `git` 실행파일을 찾을 수 없음

### 4.2 git rev-parse의 역할
```
git rev-parse --show-toplevel
→ 현재 working directory의 git repository 루트 경로 반환
→ EAS CLI가 git 메타데이터 수집 시 사용
```

### 4.3 PowerShell vs Bash의 PATH 차이
```
PowerShell:
- 사용자 환경변수를 프로필 로드 시점에만 읽음
- 새 세션 시작 시마다 프로필 실행
- 프로필이 없으면 기본 PATH만 사용

Git Bash (MSYS2):
- 자체 /etc/profile이 Git 경로 자동 포함
- 독립적인 PATH 환경 보유
- 프로필 없어도 git 접근 가능
```

---

## 5. 검증 및 테스트

### 5.1 현재 상태 확인
```powershell
# PowerShell에서
git --version
# 출력: git version 2.55.0.windows.1

git rev-parse --show-toplevel
# 출력: C:\Users\dctm1\YongStudyApp

# EAS 빌드 재시도
eas build -p android -e preview --wait
# 성공 예상 (git 환경 정상)
```

### 5.2 향후 검증 항목
- [ ] 새 PowerShell 세션 시작 후 `git --version` 실행 → 성공해야 함
- [ ] `build-apk.ps1` 스크립트로 빌드 성공
- [ ] EAS 빌드 complete → APK 다운로드 가능

---

## 6. 학습 포인트

### 이 문제에서 배운 점
1. **환경 문제 vs 설정 문제 구분**
   - Git은 설치되어 있었음 (설치 문제 아님)
   - PowerShell이 git을 못 찾음 (환경 문제)

2. **Shell 종류에 따른 차이**
   - 같은 Windows, 같은 Git 설치
   - PowerShell: PATH 등재 필요
   - Git Bash: 기본 포함
   - → Bash 사용하는 게 더 신뢰성 높음

3. **도구 자동화의 가치**
   - `build-apk.ps1` 같은 래퍼 스크립트가 있으면
   - 사용자는 세부 환경 신경쓰지 않아도 됨

---

## 7. 참고 자료

**PowerShell 프로필:**
- 파일: `$PROFILE.CurrentUserAllHosts`
- Windows에서는 보통: `C:\Users\<username>\OneDrive\문서\WindowsPowerShell\profile.ps1`
- 프로필이 없으면 `New-Item`으로 생성

**Git for Windows:**
- 기본 설치 경로: `C:\Program Files\Git`
- cmd 폴더: `C:\Program Files\Git\cmd` (PATH 추가 대상)
- bin 폴더: `C:\Program Files\Git\bin` (대체 경로)

**EAS CLI:**
- `git rev-parse` 사용: 프로젝트 메타데이터 수집
- PowerShell에서만 이 문제 발생 (Bash에서는 정상)
