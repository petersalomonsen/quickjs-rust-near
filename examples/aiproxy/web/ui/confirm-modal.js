const modalElement = document.getElementById("confirmationmodal");
const confirmationModal = new bootstrap.Modal(modalElement);

export async function confirmModal(title, description) {
  return await new Promise((resolve) => {
    modalElement.querySelector("#confirmationModalTitle").innerHTML = title;
    modalElement.querySelector("#confirmationModalBody").innerHTML =
      description;
    confirmationModal.show();
    let modalResult = false;
    modalElement.querySelector("#confirmationModalCancelButton").onclick =
      () => {
        confirmationModal.hide();
      };
    modalElement.querySelector("#confirmationModalOkButton").onclick = () => {
      modalResult = true;
      confirmationModal.hide();
    };
    modalElement.addEventListener("hidden.bs.modal", () => {
      resolve(modalResult);
    });
  });
}
