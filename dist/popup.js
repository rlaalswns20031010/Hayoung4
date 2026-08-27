const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const lastReady = document.querySelector("#last-ready");
const registerButton = document.querySelector("#register");
const manageButton = document.querySelector("#manage");
const updateCard = document.querySelector("#update-card");
const updateTitle = document.querySelector("#update-title");
const updateDetail = document.querySelector("#update-detail");
const updateLink = document.querySelector("#update-link");

function setStatus(status) {
  const registered = status?.ok && status.registered;
  statusDot.className = `status-dot ${registered ? "success" : "error"}`;
  statusTitle.textContent = registered ? "정상 등록됨" : "등록되지 않음";
  statusDetail.textContent = registered
    ? "지원 사이트에서 Hayoung4 패널이 실행됩니다."
    : status?.error || "아래 버튼을 눌러 다시 등록하세요.";

  lastReady.textContent = status?.lastContentReady?.at
    ? new Date(status.lastContentReady.at).toLocaleString("ko-KR")
    : "지원 사이트 새로고침 필요";
}

function setUpdateStatus(status) {
  updateCard.dataset.status = status?.status ?? "unavailable";
  updateLink.hidden = true;
  if (status?.status === "available") {
    updateTitle.textContent = `${status.latestVersion} 업데이트 있음`;
    updateDetail.textContent = `현재 설치 버전은 ${status.currentVersion}입니다.`;
    updateLink.href = status.releaseUrl;
    updateLink.hidden = false;
    return;
  }
  if (status?.status === "current") {
    updateTitle.textContent = "최신 버전 사용 중";
    updateDetail.textContent = `현재 ${status.currentVersion}`;
    return;
  }
  updateTitle.textContent = "업데이트 확인 불가";
  updateDetail.textContent = "Git 버전 파일을 다음 실행 때 다시 확인합니다.";
}

async function send(type) {
  try {
    return await chrome.runtime.sendMessage({ type });
  } catch (error) {
    const disconnected =
      /message channel closed|asynchronous response|receiving end does not exist|could not establish connection/i.test(
        error.message,
      );
    return {
      ok: false,
      error: disconnected
        ? "백그라운드 연결이 끊겼습니다. 아래 확장 관리 버튼에서 Hayoung4를 다시 로드하세요."
        : error.message,
    };
  }
}

registerButton.addEventListener("click", async () => {
  registerButton.disabled = true;
  registerButton.textContent = "등록 중…";
  setStatus(await send("hayoung:register-content"));
  registerButton.disabled = false;
  registerButton.textContent = "콘텐츠 스크립트 다시 등록";
});

manageButton.addEventListener("click", async () => {
  manageButton.disabled = true;
  try {
    // Open directly from the popup when the service worker response channel is
    // not currently available.
    await chrome.tabs.create({
      url: `chrome://extensions/?id=${encodeURIComponent(chrome.runtime.id)}`,
    });
  } catch (error) {
    setStatus({ ok: false, error: error.message });
  }
  manageButton.disabled = false;
});

const [registrationStatus, updateResponse] = await Promise.all([
  send("hayoung:get-registration-status"),
  send("hayoung:check-update"),
]);
setStatus(registrationStatus);
setUpdateStatus(updateResponse?.updateStatus);
