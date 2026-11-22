(() => {
  const form = document.querySelector("#profile-identity");
  if (!form) return;
  const name = form.elements.username;
  const photo = form.elements.photo;
  const save = form.querySelector("button[type=submit]");
  const preview = document.querySelector("[data-preview]");
  const original = preview.getAttribute("src");
  const status = document.querySelector("#photo-status");
  let localPhoto;

  function updateSave() {
    save.disabled = name.value === name.defaultValue && !photo.files.length;
  }
  name.addEventListener("input", updateSave);
  photo.addEventListener("change", () => {
    if (localPhoto) URL.revokeObjectURL(localPhoto);
    const file = photo.files[0];
    const oversized = file && file.size > 5 * 1024 * 1024;
    if (oversized) photo.value = "";
    localPhoto = file && !oversized ? URL.createObjectURL(file) : null;
    const src = localPhoto || original;
    if (src) preview.src = src;
    else preview.removeAttribute("src");
    preview.hidden = !src;
    status.textContent = oversized ? "Choose a photo under 5 MB." : localPhoto ? file.name : "";
    updateSave();
  });
  updateSave();
  const toggle = document.querySelector("[data-show-password]");
  if (toggle) {
    toggle.closest("label").hidden = false;
    const fields = toggle.form.querySelectorAll('input[type="password"]');
    toggle.addEventListener("change", () => {
      for (const field of fields) field.type = toggle.checked ? "text" : "password";
    });
  }
})();
