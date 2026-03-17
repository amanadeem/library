const adminStatus = document.getElementById("adminStatus");

function setAdminStatus(message, isError = false) {
    adminStatus.textContent = message;
    adminStatus.style.color = isError ? "#8a2f2f" : "#1f6a52";
}

function num(value) {
    return value ?? 0;
}

async function api(path, method = "GET", body) {
    const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed request");
    }
    return data;
}

function fillSummary(summary) {
    document.getElementById("mTotalBooks").textContent = num(summary.total_books);
    document.getElementById("mAvailableBooks").textContent = num(summary.available_books);
    document.getElementById("mIssuedBooks").textContent = num(summary.issued_books);
    document.getElementById("mTotalIssues").textContent = num(summary.total_issues);
    document.getElementById("mTotalDonations").textContent = num(summary.total_donations);
    document.getElementById("mAvgRating").textContent = summary.average_rating ?? "0";
}

function fillTopRated(topRatedBooks) {
    const body = document.getElementById("topRatedBody");
    body.innerHTML = "";

    if (!topRatedBooks.length) {
        body.innerHTML = '<tr><td colspan="4">No rating data yet.</td></tr>';
        return;
    }

    for (const row of topRatedBooks) {
        body.insertAdjacentHTML(
            "beforeend",
            `<tr><td>${row.title}</td><td>${row.author}</td><td>${row.avg_rating}</td><td>${row.review_count}</td></tr>`
        );
    }
}

function fillInventory(inventory) {
    const body = document.getElementById("inventoryBody");
    body.innerHTML = "";

    if (!inventory.length) {
        body.innerHTML = '<tr><td colspan="7">No books found.</td></tr>';
        return;
    }

    for (const row of inventory) {
        body.insertAdjacentHTML(
            "beforeend",
            `<tr>
                <td>${row.id}</td>
                <td>${row.title}</td>
                <td>${row.author}</td>
                <td>${row.category || "-"}</td>
                <td>${row.status}</td>
                <td>${row.issued_to || "-"}</td>
                <td>${row.average_rating || "-"}</td>
            </tr>`
        );
    }
}

function fillTransactions(transactions) {
    const body = document.getElementById("transactionsBody");
    body.innerHTML = "";

    if (!transactions.length) {
        body.innerHTML = '<tr><td colspan="5">No activity yet.</td></tr>';
        return;
    }

    for (const row of transactions) {
        body.insertAdjacentHTML(
            "beforeend",
            `<tr>
                <td>${new Date(row.date).toLocaleString()}</td>
                <td>${row.action}</td>
                <td>${row.title || `#${row.book_id}`}</td>
                <td>${row.user_name || "-"}</td>
                <td>${row.note || "-"}</td>
            </tr>`
        );
    }
}

function fillTrend(issuesPerDay) {
    const list = document.getElementById("issuesTrend");
    list.innerHTML = "";

    if (!issuesPerDay.length) {
        list.innerHTML = "<li>No issue trend data yet.</li>";
        return;
    }

    for (const row of issuesPerDay) {
        list.insertAdjacentHTML("beforeend", `<li>${row.day}: ${row.count} books issued</li>`);
    }
}

async function loadStats() {
    try {
        const data = await api("/api/admin/stats");
        fillSummary(data.summary || {});
        fillTopRated(data.topRatedBooks || []);
        fillInventory(data.inventory || []);
        fillTransactions(data.recentTransactions || []);
        fillTrend(data.issuesPerDay || []);
        setAdminStatus("Analytics refreshed.");
    } catch (error) {
        setAdminStatus(error.message, true);
    }
}

function bindAddBookForm() {
    const form = document.getElementById("adminAddBookForm");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);

        try {
            await api("/api/books/giveaway", "POST", {
                title: data.get("title"),
                author: data.get("author"),
                category: data.get("category"),
                user_name: data.get("user_name") || "Admin",
            });
            setAdminStatus("Book added successfully from admin panel.");
            form.reset();
            await loadStats();
        } catch (error) {
            setAdminStatus(error.message, true);
        }
    });
}

document.getElementById("refreshAdminBtn").addEventListener("click", loadStats);
bindAddBookForm();
loadStats();
