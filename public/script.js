document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("chatForm");
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");

    // Riwayat percakapan untuk dikirim ke API
    const conversationHistory = [
        {
            role: "assistant",
            content: "Halo! Ada yang bisa saya bantu?"
        }
    ];

    let isGenerating = false;

    // Scroll ke bagian paling bawah pesan
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Fungsi membuat bubble pesan baru
    function createMessageElement(role, text = "") {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${role}`;

        const bubbleDiv = document.createElement("div");
        bubbleDiv.className = "message-bubble";
        bubbleDiv.textContent = text;

        messageDiv.appendChild(bubbleDiv);
        chatMessages.appendChild(messageDiv);
        scrollToBottom();

        return bubbleDiv;
    }

    // Fungsi menampilkan typing indicator
    function createTypingIndicator() {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message bot";

        const bubbleDiv = document.createElement("div");
        bubbleDiv.className = "message-bubble";

        const typingDiv = document.createElement("div");
        typingDiv.className = "typing-indicator";
        typingDiv.innerHTML = `
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        `;

        bubbleDiv.appendChild(typingDiv);
        messageDiv.appendChild(bubbleDiv);
        chatMessages.appendChild(messageDiv);
        scrollToBottom();

        return bubbleDiv;
    }

    // Mengatur status form (aktif/nonaktif)
    function setFormState(disabled) {
        isGenerating = disabled;
        messageInput.disabled = disabled;
        sendBtn.disabled = disabled;
        if (!disabled) {
            messageInput.focus();
        }
    }

    // Handle submit form
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userText = messageInput.value.trim();
        if (!userText || isGenerating) return;

        // Tampilkan pesan pengguna
        createMessageElement("user", userText);
        conversationHistory.push({ role: "user", content: userText });

        // Reset input dan matikan tombol kirim sementara
        messageInput.value = "";
        setFormState(true);

        // Tampilkan animasi mengetik (bot)
        const botBubble = createTypingIndicator();

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: conversationHistory
                })
            });

            if (!response.ok) {
                let errorMsg = "Terjadi kesalahan saat memproses respon.";
                try {
                    const errorJson = await response.json();
                    if (errorJson.error) errorMsg = errorJson.error;
                } catch (_) {
                    // Ignore json parsing error
                }
                botBubble.textContent = errorMsg;
                setFormState(false);
                return;
            }

            // Membaca respon SSE secara streaming
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botReply = "";
            let buffer = "";
            let isFirstChunk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // Simpan baris yang belum selesai

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

                    const data = trimmedLine.slice(5).trim();
                    if (data === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (typeof parsed === "string") {
                            if (isFirstChunk) {
                                botBubble.innerHTML = ""; // Hapus animasi typing
                                isFirstChunk = false;
                            }
                            botReply += parsed;
                            botBubble.textContent = botReply;
                            scrollToBottom();
                        }
                    } catch (parseError) {
                        console.error("Gagal mengurai chunk streaming:", parseError);
                    }
                }
            }

            if (botReply) {
                conversationHistory.push({ role: "assistant", content: botReply });
            } else if (isFirstChunk) {
                botBubble.textContent = "Tidak ada respon yang diterima.";
            }

        } catch (error) {
            console.error("Error mengirim pesan:", error);
            botBubble.textContent = "Gagal terhubung ke server. Pastikan server aktif.";
        } finally {
            setFormState(false);
        }
    });

    // Fokus awal pada input
    messageInput.focus();
});
