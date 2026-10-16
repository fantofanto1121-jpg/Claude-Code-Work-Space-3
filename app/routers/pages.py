"""公開ページ（トップ・カテゴリー・検索・規約類）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ratelimit, services
from app.config import settings
from app.db import get_db
from app.errors import NotFound, RateLimited
from app.models import Category, Thread
from app.security import client_ip
from app.templating import render
from app.utils import normalize_single_line, page_range

router = APIRouter()


@router.get("/")
def index(request: Request, db: Session = Depends(get_db)):
    categories = services.get_categories(db)
    counts = services.category_thread_counts(db)

    def top(sort: str, limit: int = 8):
        stmt = services.apply_sort(services.visible_threads(), sort).limit(limit)
        return list(db.scalars(stmt).unique().all())

    return render(
        request,
        "index.html",
        {
            "categories": categories,
            "category_counts": counts,
            "latest_threads": top("new"),
            "popular_threads": top("popular"),
            "updated_threads": top("updated"),
            "total_threads": sum(counts.values()),
        },
    )


@router.get("/c/{slug}")
def category_page(
    request: Request,
    slug: str,
    page: int = Query(1, ge=1, le=10_000),
    sort: str = Query("updated"),
    db: Session = Depends(get_db),
):
    category = db.scalar(select(Category).where(Category.slug == slug))
    if category is None or not category.is_active:
        raise NotFound("そのカテゴリーは存在しません。")

    sort = sort if sort in services.SORT_OPTIONS else "updated"
    stmt = services.apply_sort(
        services.visible_threads().where(Thread.category_id == category.id), sort
    )
    threads, total, total_pages = services.paginate(db, stmt, page, settings.threads_per_page)

    return render(
        request,
        "category.html",
        {
            "categories": services.get_categories(db),
            "category": category,
            "threads": threads,
            "total": total,
            "page": min(page, total_pages),
            "total_pages": total_pages,
            "pages": page_range(min(page, total_pages), total_pages),
            "sort": sort,
            "sort_options": services.SORT_OPTIONS,
        },
    )


@router.get("/search")
def search_page(
    request: Request,
    q: str = Query("", max_length=80),
    page: int = Query(1, ge=1, le=10_000),
    sort: str = Query("updated"),
    category: str = Query(""),
    db: Session = Depends(get_db),
):
    keyword = normalize_single_line(q)
    categories = services.get_categories(db)
    selected = next((c for c in categories if c.slug == category), None)
    sort = sort if sort in services.SORT_OPTIONS else "updated"

    context: dict = {
        "categories": categories,
        "keyword": keyword,
        "selected_category": selected,
        "sort": sort,
        "sort_options": services.SORT_OPTIONS,
        "threads": [],
        "total": 0,
        "page": 1,
        "total_pages": 1,
        "pages": [],
        "searched": False,
    }

    if len(keyword) >= 2:
        if not ratelimit.check(db, "search", client_ip(request)):
            raise RateLimited("検索のリクエストが多すぎます。1分ほどお待ちください。")
        db.commit()

        stmt = services.apply_sort(
            services.search_threads_stmt(keyword, selected.id if selected else None), sort
        )
        threads, total, total_pages = services.paginate(
            db, stmt, page, settings.threads_per_page
        )
        context.update(
            threads=threads,
            total=total,
            page=min(page, total_pages),
            total_pages=total_pages,
            pages=page_range(min(page, total_pages), total_pages),
            searched=True,
        )
    elif keyword:
        context["search_error"] = "検索キーワードは2文字以上で入力してください。"

    return render(request, "search.html", context)


@router.get("/terms")
def terms(request: Request):
    return render(request, "legal/terms.html", {})


@router.get("/privacy")
def privacy(request: Request):
    return render(request, "legal/privacy.html", {})


@router.get("/guidelines")
def guidelines(request: Request):
    return render(request, "legal/guidelines.html", {})


@router.get("/contact")
def contact(request: Request):
    return render(request, "legal/contact.html", {})
