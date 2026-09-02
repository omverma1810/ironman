import pytest

from common.errors import InvalidStateTransition
from fulfilment.models import JobStatus
from fulfilment.state_machine import transition_job

pytestmark = pytest.mark.django_db


def test_pending_to_en_route_sets_started_at(pickup_job):
    assert pickup_job.status == JobStatus.PENDING
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    assert job.status == JobStatus.EN_ROUTE
    assert job.started_at is not None


def test_en_route_to_arrived_sets_arrived_at(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.ARRIVED)
    assert job.status == JobStatus.ARRIVED
    assert job.arrived_at is not None


def test_complete_direct_from_en_route_is_allowed(pickup_job):
    """`arrive` is a best-effort checkpoint, not a hard gate."""
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.DONE)
    assert job.status == JobStatus.DONE
    assert job.completed_at is not None


def test_complete_from_arrived_is_allowed(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.ARRIVED)
    job = transition_job(job, JobStatus.DONE)
    assert job.status == JobStatus.DONE


def test_fail_from_en_route_is_allowed(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.FAILED)
    assert job.status == JobStatus.FAILED
    assert job.completed_at is not None


def test_fail_from_arrived_is_allowed(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.ARRIVED)
    job = transition_job(job, JobStatus.FAILED)
    assert job.status == JobStatus.FAILED


def test_pending_cannot_go_directly_to_arrived(pickup_job):
    with pytest.raises(InvalidStateTransition):
        transition_job(pickup_job, JobStatus.ARRIVED)


def test_pending_cannot_go_directly_to_done(pickup_job):
    with pytest.raises(InvalidStateTransition):
        transition_job(pickup_job, JobStatus.DONE)


def test_done_is_terminal(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.DONE)
    with pytest.raises(InvalidStateTransition):
        transition_job(job, JobStatus.EN_ROUTE)


def test_failed_is_terminal(pickup_job):
    job = transition_job(pickup_job, JobStatus.EN_ROUTE)
    job = transition_job(job, JobStatus.FAILED)
    with pytest.raises(InvalidStateTransition):
        transition_job(job, JobStatus.DONE)
