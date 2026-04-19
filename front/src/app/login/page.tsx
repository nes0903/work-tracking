import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "로그인 요청이 올바르지 않습니다.",
  invalid_state: "인증 세션이 만료됐습니다. 다시 시도해주세요.",
  invalid_user: "사용자 정보를 가져올 수 없습니다.",
  forbidden_domain: "허용된 조직 구성원만 접근할 수 있습니다.",
  exchange_failed: "네이버웍스 토큰 교환에 실패했습니다.",
  access_denied: "로그인이 취소됐습니다.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? (ERROR_MESSAGES[params.error] ?? params.error) : null;
  const redirect = params.redirect && params.redirect.startsWith("/") ? params.redirect : "/";
  const href = `/api/auth/line-works/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="login-kicker">Work Tracking</p>
        <h1>조직 계정으로 로그인</h1>
        <p className="login-lead">
          네이버웍스(LINE WORKS) 계정으로 로그인하시면 이용하실 수 있습니다.
          <br />
          승인된 조직 구성원만 접근 가능합니다.
        </p>

        {errorMessage ? <p className="login-error">{errorMessage}</p> : null}

        <Link className="login-button" href={href} prefetch={false}>
          네이버웍스로 로그인
        </Link>
      </section>
    </main>
  );
}
