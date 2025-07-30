document.addEventListener('DOMContentLoaded', () => {

    const sections = document.querySelectorAll('.content-section');

    const observerOptions = {
        root: null, // usa o viewport como a área de observação
        rootMargin: '0px',
        threshold: 0.1 // A animação começa quando 10% do elemento está visível
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            // Se o elemento está intersectando (visível)
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Para de observar o elemento depois que ele se tornou visível
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observa cada uma das seções
    sections.forEach(section => {
        observer.observe(section);
    });

});