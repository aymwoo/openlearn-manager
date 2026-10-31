//! Windows 控制台窗口抑制。
//!
//! # 问题
//! 打包后的 OpenLearn Manager 是 GUI（windows 子系统）进程，本身没有控制台。
//! 此时只要启动任何 console 子系统的程序 —— `cmd.exe`、`npx`、`node`
//! （以及 `where`、`tasklist`、`taskkill` 这类探测命令）—— Windows 都会为它
//! 新建一个 `conhost.exe`，也就是用户看到的那些黑色终端窗口。
//! 因为我们把 stdout/stderr 都重定向到了管道，这些窗口里没有任何输出；
//! 而关掉窗口会连带杀死其中的进程，服务也就跟着停了。
//!
//! # 为什么不能只加 `CREATE_NO_WINDOW`
//! 常见的做法是给子进程设置 `CREATE_NO_WINDOW`（0x08000000）。它确实能让
//! **直接**子进程不弹窗，但这个标志**不会向下传递**：它只是不给子进程分配
//! 控制台，于是子进程再 fork 出来的孙进程（npx → 真正的 node 服务进程）
//! 因为"没有可继承的控制台"，会被 Windows 分配一个全新的、可见的控制台。
//! 表现出来的现象就是窗口没少，只是往上挪了一层。
//!
//! # 这里的做法
//! 反过来做：不给子进程"剥夺"控制台，而是给本进程**先申请一个控制台并立刻
//! 隐藏它**。之后所有子进程、孙进程、曾孙进程都会继承这份已经存在的隐藏
//! 控制台，谁都不需要重新分配，整棵进程树都不会再弹出窗口。
//!
//! 只有当本进程连一个控制台都拿不到（`AllocConsole` 失败）时，才退化为
//! `CREATE_NO_WINDOW`，至少保证直接子进程不弹窗。

/// `CreateProcess` 标志：创建不显示窗口的控制台。仅作为兜底使用。
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SW_HIDE: i32 = 0;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn AllocConsole() -> i32;
    fn GetConsoleWindow() -> isize;
}

#[link(name = "user32")]
unsafe extern "system" {
    fn ShowWindow(hwnd: isize, n_cmd_show: i32) -> i32;
}

/// 为本进程准备一个可供子进程继承的控制台；成功时它一定是隐藏的或本来就属于用户。
fn ensure_console() -> bool {
    unsafe {
        // 已经有控制台：debug 构建是 console 子系统，从终端启动时就是这种情况。
        // 那份控制台是用户自己的终端窗口，只让子进程继承，绝不能隐藏。
        if GetConsoleWindow() != 0 {
            return true;
        }

        // GUI 进程没有控制台：申请一个并立刻隐藏。
        // 这一步会短暂创建 conhost 窗口，因此放在应用启动阶段、主窗口出现之前调用。
        if AllocConsole() == 0 {
            return false;
        }

        let hwnd = GetConsoleWindow();
        if hwnd == 0 {
            return false;
        }
        ShowWindow(hwnd, SW_HIDE);
        true
    }
}

static CONSOLE_READY: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// 本进程是否已经持有控制台。
///
/// 为 `true` 时不要给子进程加 `CREATE_NO_WINDOW` —— 让它继承现成的隐藏控制台，
/// 这样子进程的子进程也不会再去新建可见窗口。
pub fn console_ready() -> bool {
    *CONSOLE_READY.get_or_init(ensure_console)
}

/// 在应用启动时尽早调用一次，把可能出现的一次性闪烁压在主窗口出现之前。
pub fn init() {
    let _ = console_ready();
}
