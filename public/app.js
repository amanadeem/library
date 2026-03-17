const statusMessage = document.getElementById("statusMessage");
const booksTableBody = document.getElementById("booksTableBody");
const issueBookSelect = document.getElementById("issueBookSelect");
const reviewBookSelect = document.getElementById("reviewBookSelect");
const returnBookSelect = document.getElementById("returnBookSelect");
const searchInput = document.getElementById("searchInput");

let booksCache = [];

function setStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? "#8a2f2f" : "#1f6a52";
}

function formatRating(avg, count) {
    if (avg === null || avg === undefined || Number(count) === 0) {
        return "-";
    }
    return `${avg} (${count})`;
}

function renderBooksTable(books) {
    booksTableBody.innerHTML = "";

    if (!books.length) {
        booksTableBody.innerHTML = '<tr><td colspan="6">No books found.</td></tr>';
        return;
    }

    for (const book of books) {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${book.id}</td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.category || "-"}</td>
            <td>${book.status}</td>
            <td>${formatRating(book.average_rating, book.rating_count)}</td>
        `;
        booksTableBody.appendChild(row);
    }
}

function renderSelects(books) {
    issueBookSelect.innerHTML = "";
    reviewBookSelect.innerHTML = "";
    returnBookSelect.innerHTML = "";

    const availableBooks = books.filter((book) => book.status === "available");
    const issuedBooks = books.filter((book) => book.status === "issued");

    for (const book of availableBooks) {
        const option = `<option value="${book.id}">${book.id} - ${book.title} (${book.author})</option>`;
        issueBookSelect.insertAdjacentHTML("beforeend", option);
        reviewBookSelect.insertAdjacentHTML("beforeend", option);
    }

    for (const book of issuedBooks) {
        const option = `<option value="${book.id}">${book.id} - ${book.title} (${book.author})</option>`;
        returnBookSelect.insertAdjacentHTML("beforeend", option);
    }

    if (!availableBooks.length) {
        issueBookSelect.innerHTML = "<option value=''>No available books</option>";
        reviewBookSelect.innerHTML = "<option value=''>No available books</option>";
    }

    if (!issuedBooks.length) {
        returnBookSelect.innerHTML = "<option value=''>No issued books</option>";
    }
}

async function api(path, method = "GET", body) {
    const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

async function refreshBooks(search = "") {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    const data = await api(`/api/books${query}`);
    booksCache = data.books;
    renderBooksTable(booksCache);
    renderSelects(booksCache);
}

function bindTabs() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    for (const button of tabButtons) {
        button.addEventListener("click", () => {
            tabButtons.forEach((btn) => btn.classList.remove("active"));
            tabContents.forEach((panel) => panel.classList.remove("active"));

            button.classList.add("active");
            const tabId = button.dataset.tab;
            document.getElementById(tabId).classList.add("active");
        });
    }
}

function bindForms() {
    document.getElementById("issueForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
            await api("/api/books/issue", "POST", {
                user_name: form.get("user_name"),
                book_id: Number(form.get("book_id")),
            });
            setStatus("Book issued successfully.");
            event.target.reset();
            await refreshBooks(searchInput.value.trim());
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    document.getElementById("giveawayForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
            await api("/api/books/giveaway", "POST", {
                title: form.get("title"),
                author: form.get("author"),
                category: form.get("category"),
                user_name: form.get("user_name"),
            });
            setStatus("Donation recorded. JazakAllah khair.");
            event.target.reset();
            await refreshBooks(searchInput.value.trim());
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    document.getElementById("reviewForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
            await api("/api/books/review", "POST", {
                user_name: form.get("user_name"),
                book_id: Number(form.get("book_id")),
                rating: Number(form.get("rating")),
                comment: form.get("comment"),
            });
            setStatus("Review submitted successfully.");
            event.target.reset();
            await refreshBooks(searchInput.value.trim());
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    document.getElementById("returnForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        try {
            await api("/api/books/return", "POST", {
                user_name: form.get("user_name"),
                book_id: Number(form.get("book_id")),
            });
            setStatus("Book marked as returned.");
            event.target.reset();
            await refreshBooks(searchInput.value.trim());
        } catch (error) {
            setStatus(error.message, true);
        }
    });
}

function bindTopActions() {
    document.getElementById("refreshBooksBtn").addEventListener("click", async () => {
        try {
            await refreshBooks(searchInput.value.trim());
            setStatus("Shelf refreshed.");
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    searchInput.addEventListener("input", async () => {
        try {
            await refreshBooks(searchInput.value.trim());
        } catch (error) {
            setStatus(error.message, true);
        }
    });
}

async function init() {
    bindTabs();
    bindForms();
    bindTopActions();

    try {
        await refreshBooks();
        setStatus("Kiosk ready.");
    } catch (error) {
        setStatus(`Could not load books: ${error.message}`, true);
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            setStatus("Service worker could not be installed.", true);
        });
    }
}

init();
