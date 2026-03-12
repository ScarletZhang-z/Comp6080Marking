import re

def parse_stats(text):
    """从输入文本中提取数字统计"""
    stats = {}
    
    patterns = {
        'total_commits': r'Total commits[:\s]+(\d+)',
        'unique_days': r'Unique commit days[:\s]+(\d+)',
        'lines_added': r'Total lines added[:\s]+(\d+)',
        'lines_removed': r'Total lines removed[:\s]+(\d+)',
    }
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        stats[key] = int(match.group(1)) if match else 0
    
    return stats


def check_requirements(stats):
    """检查是否满足要求，返回违规信息列表"""
    violations = []

    # 要求1：至少4个唯一提交天数
    MIN_UNIQUE_DAYS = 4
    if stats['unique_days'] < MIN_UNIQUE_DAYS:
        violations.append(
            f"You must make commits on at least {MIN_UNIQUE_DAYS} unique days prior to due date. "
            f"But your unique commit days: {stats['unique_days']}"
        )

    # 要求2：至少20次提交
    MIN_COMMITS = 20
    if stats['total_commits'] < MIN_COMMITS:
        violations.append(
            f"You must make at least {MIN_COMMITS} commits across the course of your assignment. "
            f"But your commits: {stats['total_commits']}"
        )

    # 要求3：每次提交不超过100行新增（允许3次例外）
    MAX_LINES_PER_COMMIT = 100
    EXCEPTIONS_ALLOWED = 3
    if stats['total_commits'] > 0:
        avg_lines = stats['lines_added'] / stats['total_commits']
        # 估算超标提交次数（超过100行的提交）
        over_limit_commits = 0
        if avg_lines > MAX_LINES_PER_COMMIT:
            # 粗略估算：假设超标的都集中在少数几次提交
            over_limit_commits = int((stats['lines_added'] - MAX_LINES_PER_COMMIT * stats['total_commits']) // MAX_LINES_PER_COMMIT) + 1
        
        if over_limit_commits > EXCEPTIONS_ALLOWED:
            violations.append(
                f"Each commit include no more than {MAX_LINES_PER_COMMIT} lines additions of code "
                f"(this may differ in future assignments). "
                f"You are given {EXCEPTIONS_ALLOWED} exceptions, but you've already exceeded {over_limit_commits} times."
            )
        elif over_limit_commits > 0:
            remaining = EXCEPTIONS_ALLOWED - over_limit_commits
            violations.append(
                f"Each commit include no more than {MAX_LINES_PER_COMMIT} lines additions of code "
                f"(this may differ in future assignments). "
                f"You are given {EXCEPTIONS_ALLOWED} exceptions, but you've already used {over_limit_commits} "
                f"({'1 remaining' if remaining == 1 else f'{remaining} remaining'})."
            )

    return violations


def generate_report(input_text):
    print("=" * 60)
    print("COMMIT STATS CHECKER")
    print("=" * 60)

    stats = parse_stats(input_text)

    print("\n📊 Parsed Statistics:")
    print(f"  Total commits      : {stats['total_commits']}")
    print(f"  Unique commit days : {stats['unique_days']}")
    print(f"  Total lines added  : {stats['lines_added']}")
    print(f"  Total lines removed: {stats['lines_removed']}")

    violations = check_requirements(stats)

    if not violations:
        print("\n✅ All requirements met! Great work.")
    else:
        print(f"\n❌ Found {len(violations)} violation(s):\n")
        for i, v in enumerate(violations, 1):
            print(f"  {i}. {v}")
        
        print("\n" + "=" * 60)
        print("📋 Generated Warning Message:")
        print("=" * 60)
        print("\n" + "\n".join(violations))

    print("\n" + "=" * 60)


# ── 主程序 ──────────────────────────────────────────────────
if __name__ == "__main__":
    print("Paste your commit stats below (press Enter twice when done):\n")
    
    lines = []
    while True:
        line = input()
        if line == "":
            break
        lines.append(line)
    
    input_text = " ".join(lines)
    generate_report(input_text)