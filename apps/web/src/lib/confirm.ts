export async function niceConfirm(
  title: string,
  text: string,
  type: "warning" | "danger" = "warning"
): Promise<boolean> {
  const Swal = (await import("sweetalert2")).default;
  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: type === "danger" ? "#ef4444" : "#3b82f6",
    cancelButtonColor: "#4b5563",
    confirmButtonText: "確定",
    cancelButtonText: "取消",
    background: "#111520",
    color: "#f3f4f6",
    customClass: {
      container: "swal2-high-zindex",
    },
    didOpen: (popup) => {
      const container = popup.closest(".swal2-container") as HTMLElement | null;
      if (container) {
        container.style.zIndex = "999999";
      }
    },
  });
  return result.isConfirmed;
}

export async function niceToast(
  title: string,
  icon: "success" | "error" | "warning" | "info" = "success"
) {
  const Swal = (await import("sweetalert2")).default;
  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: "#111520",
    color: "#f3f4f6",
    customClass: {
      container: "swal2-high-zindex",
    },
    didOpen: (toast) => {
      const container = toast.closest(".swal2-container") as HTMLElement | null;
      if (container) {
        container.style.zIndex = "999999";
      }
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    },
  });
  Toast.fire({
    icon,
    title,
  });
}
