# Linux dev shell (NixOS). The app ships for macOS only; this exists so
# `pnpm tauri dev`, `pnpm tauri build` and `cargo test` work on a NixOS box.
# Usage: `nix-shell`, then run the usual commands. Rust and Node come from the host.
{ pkgs ? import <nixpkgs> { } }:

let
  libs = with pkgs; [
    webkitgtk_4_1
    gtk3
    libsoup_3
    glib
    cairo
    pango
    gdk-pixbuf
    atk
    librsvg
    openssl
    dbus
    libxcb
    libx11
    libxscrnsaver
    libayatana-appindicator
  ];
in
pkgs.mkShell {
  nativeBuildInputs = [ pkgs.pkg-config ];
  buildInputs = libs;

  # The host rustc links without Nix rpaths, so the binary finds its libraries
  # (and dlopens the tray's appindicator) through LD_LIBRARY_PATH.
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath libs;

  # GTK file dialogs abort without the gsettings schemas.
  shellHook = ''
    export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}
  '';
}
