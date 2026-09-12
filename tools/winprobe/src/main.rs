#![allow(non_upper_case_globals)]
//! Dump everything macOS will tell us about an app's windows.
//!
//! Usage:
//!   cargo run -- [pid | app-name] [--delay N] [--all-windows]
//!
//! With no argument the frontmost app is probed. `--delay N` waits N seconds so you
//! can switch focus to the app under test. Sources:
//!   1. active-win-pos-rs (what the tracker sees today)
//!   2. CGWindowListCopyWindowInfo   (needs Screen Recording for kCGWindowName)
//!   3. Accessibility API            (needs Accessibility permission; AXTitle/AXDocument)

use std::ffi::c_void;
use std::process::Command;
use std::time::Duration;

use accessibility_sys::*;
use core_foundation::array::CFArray;
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowListOptionAll, kCGWindowListOptionOnScreenOnly,
};

extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let delay = flag_value(&args, "--delay").and_then(|v| v.parse::<u64>().ok());
    let all_windows = args.iter().any(|a| a == "--all-windows");
    let target = args.iter().find(|a| !a.starts_with("--") && Some(a.as_str()) != flag_value(&args, "--delay"));

    if let Some(d) = delay {
        eprintln!("waiting {d}s — switch to the app you want to probe…");
        std::thread::sleep(Duration::from_secs(d));
    }

    section("permissions");
    println!("screen recording (CGPreflightScreenCaptureAccess): {}", unsafe { CGPreflightScreenCaptureAccess() });
    println!("accessibility (AXIsProcessTrusted):                {}", unsafe { AXIsProcessTrusted() });

    section("active-win-pos-rs (tracker view)");
    let active = active_win_pos_rs::get_active_window();
    match &active {
        Ok(w) => println!("{w:#?}"),
        Err(e) => println!("error: {e:?}"),
    }

    let pid: i32 = match target {
        Some(t) => t.parse().unwrap_or_else(|_| pid_by_name(t).unwrap_or_else(|| {
            eprintln!("no process named {t}");
            std::process::exit(1)
        })),
        None => active.as_ref().map(|w| w.process_id as i32).unwrap_or_else(|_| {
            eprintln!("no active window and no pid given");
            std::process::exit(1)
        }),
    };
    println!("\ntarget pid: {pid}");

    section("CGWindowListCopyWindowInfo");
    let opts = if all_windows { kCGWindowListOptionAll } else { kCGWindowListOptionOnScreenOnly };
    match copy_window_info(opts, kCGNullWindowID) {
        None => println!("copy_window_info returned NULL"),
        Some(arr) => {
            let mut n = 0;
            for item in arr.iter() {
                let dict: CFDictionary<CFString, CFType> =
                    unsafe { CFDictionary::wrap_under_get_rule(*item as _) };
                let owner_pid = dict
                    .find(CFString::new("kCGWindowOwnerPID"))
                    .and_then(|v| v.downcast::<CFNumber>())
                    .and_then(|n| n.to_i32());
                if owner_pid != Some(pid) {
                    continue;
                }
                n += 1;
                println!("--- window #{n}");
                let (keys, vals) = dict.get_keys_and_values();
                let mut rows: Vec<(String, String)> = keys
                    .iter()
                    .zip(vals.iter())
                    .map(|(k, v)| {
                        let k: CFString = unsafe { CFString::wrap_under_get_rule(*k as _) };
                        let v: CFType = unsafe { CFType::wrap_under_get_rule(*v as _) };
                        (k.to_string(), format!("{v:?}").replace('\n', " "))
                    })
                    .collect();
                rows.sort();
                for (k, v) in rows {
                    println!("  {k:<28} {v}");
                }
            }
            if n == 0 {
                println!("no windows for pid {pid} (try --all-windows)");
            }
        }
    }

    section("Accessibility API");
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            println!("AXUIElementCreateApplication returned NULL");
            return;
        }
        println!("== application element");
        dump_attrs(app, "  ");

        for attr in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            if let Some(win) = ax_get(app, attr) {
                println!("\n== {attr}");
                let win_ref = win.as_CFTypeRef() as AXUIElementRef;
                dump_attrs(win_ref, "  ");
                println!("  -- children (depth 2)");
                dump_tree(win_ref, "    ", 2);
            } else {
                println!("\n== {attr}: <none>");
            }
        }

        if let Some(wins) = ax_get(app, kAXWindowsAttribute) {
            if let Some(list) = as_array(&wins) {
                println!("\n== AXWindows ({})", list.len());
                for w in list.iter() {
                    let w_ref = w.as_CFTypeRef() as AXUIElementRef;
                    println!(
                        "  title={:?} role={:?} subrole={:?} doc={:?}",
                        ax_str(w_ref, kAXTitleAttribute),
                        ax_str(w_ref, kAXRoleAttribute),
                        ax_str(w_ref, kAXSubroleAttribute),
                        ax_str(w_ref, kAXDocumentAttribute),
                    );
                }
            }
        }

        if let Some(el) = ax_get(app, kAXFocusedUIElementAttribute) {
            println!("\n== AXFocusedUIElement");
            dump_attrs(el.as_CFTypeRef() as AXUIElementRef, "  ");
        }
    }
}

fn section(title: &str) {
    println!("\n==================== {title} ====================");
}

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    let i = args.iter().position(|a| a == flag)?;
    args.get(i + 1).map(String::as_str)
}

fn pid_by_name(name: &str) -> Option<i32> {
    let out = Command::new("pgrep").args(["-x", "-i", name]).output().ok()?;
    String::from_utf8_lossy(&out.stdout).lines().next()?.trim().parse().ok()
}

unsafe fn ax_get(el: AXUIElementRef, attr: &str) -> Option<CFType> {
    let name = CFString::new(attr);
    let mut out: CFTypeRef = std::ptr::null();
    let err = AXUIElementCopyAttributeValue(el, name.as_concrete_TypeRef(), &mut out);
    if err != kAXErrorSuccess || out.is_null() {
        return None;
    }
    Some(CFType::wrap_under_create_rule(out))
}

fn as_array(v: &CFType) -> Option<CFArray<CFType>> {
    if v.type_of() != CFArray::<CFType>::type_id() {
        return None;
    }
    Some(unsafe { CFArray::wrap_under_get_rule(v.as_CFTypeRef() as _) })
}

unsafe fn ax_str(el: AXUIElementRef, attr: &str) -> Option<String> {
    ax_get(el, attr).map(|v| match v.downcast::<CFString>() {
        Some(s) => s.to_string(),
        None => format!("{v:?}"),
    })
}

unsafe fn dump_attrs(el: AXUIElementRef, indent: &str) {
    let mut names: *const c_void = std::ptr::null();
    let err = AXUIElementCopyAttributeNames(el, &mut names as *mut _ as *mut _);
    if err != kAXErrorSuccess || names.is_null() {
        println!("{indent}<AXUIElementCopyAttributeNames failed: {}>", ax_err(err));
        return;
    }
    let names: CFArray<CFString> = CFArray::wrap_under_create_rule(names as _);
    for name in names.iter() {
        let name = name.to_string();
        let mut out: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(el, CFString::new(&name).as_concrete_TypeRef(), &mut out);
        let val = if err != kAXErrorSuccess {
            format!("<{}>", ax_err(err))
        } else if out.is_null() {
            "<null>".into()
        } else {
            let v = CFType::wrap_under_create_rule(out);
            format!("{v:?}").replace('\n', " ")
        };
        println!("{indent}{name:<28} {val}");
    }
}

unsafe fn dump_tree(el: AXUIElementRef, indent: &str, depth: u32) {
    if depth == 0 {
        return;
    }
    let Some(children) = ax_get(el, kAXChildrenAttribute) else { return };
    let Some(list) = as_array(&children) else { return };
    for c in list.iter() {
        let c_ref = c.as_CFTypeRef() as AXUIElementRef;
        println!(
            "{indent}{:?} sub={:?} title={:?} desc={:?} value={:?}",
            ax_str(c_ref, kAXRoleAttribute).unwrap_or_default(),
            ax_str(c_ref, kAXSubroleAttribute),
            ax_str(c_ref, kAXTitleAttribute),
            ax_str(c_ref, kAXDescriptionAttribute),
            ax_str(c_ref, kAXValueAttribute).map(|s| s.chars().take(80).collect::<String>()),
        );
        dump_tree(c_ref, &format!("{indent}  "), depth - 1);
    }
}

fn ax_err(e: AXError) -> String {
    match e {
        kAXErrorAttributeUnsupported => "AttributeUnsupported".into(),
        kAXErrorNoValue => "NoValue".into(),
        kAXErrorAPIDisabled => "APIDisabled (grant Accessibility permission)".into(),
        kAXErrorInvalidUIElement => "InvalidUIElement".into(),
        kAXErrorCannotComplete => "CannotComplete".into(),
        kAXErrorNotImplemented => "NotImplemented".into(),
        other => format!("AXError {other}"),
    }
}
